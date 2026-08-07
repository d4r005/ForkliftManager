import { useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { supabase } from '../lib/supabase.js';
import * as XLSX from 'xlsx';

export default function ExcelImport({ onDone, onClose }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const downloadTemplate = useCallback(() => {
    const data = [
      {
        'Numero de empleado': '10009',
        'Nombre': 'Juan Perez Gonzalez',
        'CURP': 'PEGJ900101HDFABC01',
        'RFC': 'PEGJ900101AB1',
        'NSS': '12345678901',
        'Puesto': 'Montacarguista',
        'Vigencia DC3 (AAAA-MM-DD)': '2026-12-31',
        'Vigencia Diploma (AAAA-MM-DD)': '2026-12-31',
        'Contraseña': 'Empleado123',
        'Rol (admin/user)': 'user',
      },
      {
        'Numero de empleado': '10010',
        'Nombre': 'Maria Lopez Torres',
        'CURP': 'LMTM950215HMNLBC02',
        'RFC': 'LMTM950215MN2',
        'Vigencia DC3 (AAAA-MM-DD)': '2027-06-30',
        'Vigencia Diploma (AAAA-MM-DD)': '2027-06-30',
        'Contraseña': 'Empleado123',
        'Rol (admin/user)': 'user',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 18 }, { wch: 28 }, { wch: 22 }, { wch: 18 },
      { wch: 18 }, { wch: 20 }, { wch: 28 }, { wch: 28 },
      { wch: 16 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Empleados');
    XLSX.writeFile(wb, 'plantilla_empleados.xlsx');
  }, []);

  const handleFile = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(null);
    setResults(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rows.length === 0) {
          setError(t('impEmptyFile'));
          return;
        }

        // Normalizar rows
        const normalized = rows.map((r, i) => {
          const get = (key) => {
            const found = Object.entries(r).find(([k]) =>
              k.toLowerCase().includes(key.toLowerCase())
            );
            return found ? String(found[1]).trim() : '';
          };

          return {
            row: i + 2, // +2 porque row 1 es header
            employee_number: get('numero') || get('employee') || get('empleado'),
            name: get('nombre') || get('name'),
            curp: get('curp').toUpperCase(),
            rfc: get('rfc').toUpperCase(),
            nss: get('nss'),
            job_title: get('puesto') || get('cargo') || get('job') || get('title'),
            dc3_vigencia: get('dc3'),
            diploma_vigencia: get('diploma'),
            password: get('contrase') || get('password'),
            role: get('rol') || get('role') || 'user',
          };
        }).filter(r => r.employee_number); // Filtrar filas vacías

        if (normalized.length === 0) {
          setError(t('impNoData'));
          return;
        }

        setPreview(normalized);
      } catch (err) {
        setError(err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, [t]);

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      // Transformar a formato que espera el RPC
      const employees = preview.map(r => ({
        employee_number: r.employee_number,
        name: r.name,
        curp: r.curp || null,
        rfc: r.rfc || null,
        nss: r.nss || null,
        job_title: r.job_title || null,
        dc3_vigencia: r.dc3_vigencia || null,
        diploma_vigencia: r.diploma_vigencia || null,
        password: r.password || 'temporal123',
        role: r.role === 'admin' ? 'admin' : 'user',
      }));

      const { data, error: rpcError } = await supabase.rpc('bulk_import_employees', {
        p_admin_employee_number: user.employeeNumber,
        p_employees: employees,
      });

      if (rpcError) throw rpcError;
      if (!data?.success) throw new Error(data?.error || 'Error');

      setResults(data);
      if (onDone) onDone();
    } catch (err) {
      setError(err.message);
    }
    setImporting(false);
  };

  return (
    <div className="excel-import-overlay">
      <div className="excel-import-modal">
        <div className="excel-import-header">
          <h2>📊 {t('impTitle')}</h2>
          <button className="btn btn-sm btn-secondary" onClick={onClose}>✕</button>
        </div>

        <div className="excel-import-body">
          {error && (
            <div className="alert alert-error">⚠️ {error}</div>
          )}

          {!preview.length && !results && (
            <div className="import-empty">
              <p>{t('impInstructions')}</p>
              <div className="import-steps">
                <div className="import-step">
                  <span className="step-num">1</span>
                  <span>{t('impStep1')}</span>
                </div>
                <div className="import-step">
                  <span className="step-num">2</span>
                  <span>{t('impStep2')}</span>
                </div>
                <div className="import-step">
                  <span className="step-num">3</span>
                  <span>{t('impStep3')}</span>
                </div>
              </div>
              <button className="btn btn-primary" onClick={downloadTemplate}>
                📥 {t('impDownloadTemplate')}
              </button>
              <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
                📂 {t('impSelectFile')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handleFile}
              />
            </div>
          )}

          {preview.length > 0 && !results && (
            <div className="import-preview">
              <div className="import-preview-info">
                <strong>{preview.length}</strong> {t('impRowsFound')}
              </div>
              <div className="import-table-wrap">
                <table className="import-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('authEmployeeNumber')}</th>
                      <th>{t('expName')}</th>
                      <th>CURP</th>
                      <th>RFC</th>
                      <th>DC3</th>
                      <th>Diploma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i}>
                        <td>{r.row}</td>
                        <td><strong>{r.employee_number}</strong></td>
                        <td>{r.name}</td>
                        <td className="cell-mono">{r.curp || '—'}</td>
                        <td className="cell-mono">{r.rfc || '—'}</td>
                        <td className="cell-mono">{r.dc3_vigencia || '—'}</td>
                        <td className="cell-mono">{r.diploma_vigencia || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-actions">
                <button className="btn btn-secondary" onClick={() => setPreview([])}>
                  {t('cancel')}
                </button>
                <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                  {importing ? '⏳...' : `📤 ${t('impConfirm')} (${preview.length})`}
                </button>
              </div>
            </div>
          )}

          {results && (
            <div className="import-results">
              <div className="results-summary">
                <div className="result-stat">
                  <span className="stat-num">{results.total}</span>
                  <span className="stat-label">{t('impTotal')}</span>
                </div>
                <div className="result-stat">
                  <span className="stat-num stat-success">{results.created}</span>
                  <span className="stat-label">{t('impCreated')}</span>
                </div>
                <div className="result-stat">
                  <span className="stat-num stat-updated">{results.updated}</span>
                  <span className="stat-label">{t('impUpdated')}</span>
                </div>
                {results.errors > 0 && (
                  <div className="result-stat">
                    <span className="stat-num stat-error">{results.errors}</span>
                    <span className="stat-label">{t('impErrors')}</span>
                  </div>
                )}
              </div>

              <div className="results-detail">
                {results.results?.map((r, i) => (
                  <div key={i} className={`result-row ${r.success ? 'row-ok' : 'row-err'}`}>
                    <span className="row-icon">{r.status === 'created' ? '🟢' : r.status === 'updated' ? '🟡' : '🔴'}</span>
                    <span>#{r.employee_number} — {r.name}</span>
                    <span className="row-status">
                      {r.status === 'created' ? t('impCreated') :
                       r.status === 'updated' ? t('impUpdated') :
                       `Error: ${r.error}`}
                    </span>
                  </div>
                ))}
              </div>

              <div className="form-actions">
                <button className="btn btn-primary" onClick={onClose}>
                  ✅ {t('close')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
