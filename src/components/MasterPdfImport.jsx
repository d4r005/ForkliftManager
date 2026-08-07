import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { supabase } from '../lib/supabase.js';
import { extractPdfText, parseDocumentData } from '../utils/pdfExtract.js';
import { extractPdfPage } from '../utils/pdfSplit.js';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.min.mjs';

export default function MasterPdfImport({ onDone, onClose }) {
  const { user } = useAuth();
  const { t } = useLang();

  const [file, setFile] = useState(null);
  const [pages, setPages] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [docType, setDocType] = useState('dc3'); // dc3 or diploma

  const fileRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('list_expedientes');
      if (data?.success) setEmployees(data.employees || []);
    })();
  }, []);

  const findBestMatch = (extractedData) => {
    if (!extractedData.name && !extractedData.curp) return null;

    // 1. Intentar por CURP (exacto)
    if (extractedData.curp) {
      const match = employees.find(e => e.curp === extractedData.curp);
      if (match) return { employee: match, certainty: 100, method: 'CURP' };
    }

    // 2. Intentar por Nombre (fuzzy)
    if (extractedData.name) {
      const normalizedExtracted = extractedData.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      let best = null;
      let maxScore = 0;

      employees.forEach(emp => {
        const normalizedEmp = emp.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // Split in words
        const wordsExt = normalizedExtracted.split(/\s+/).filter(w => w.length > 2);
        const wordsEmp = normalizedEmp.split(/\s+/).filter(w => w.length > 2);

        // Count common words
        const common = wordsExt.filter(w => wordsEmp.includes(w));
        const score = (common.length * 2) / (wordsExt.length + wordsEmp.length);

        if (score > maxScore) {
          maxScore = score;
          best = emp;
        }
      });

      if (maxScore > 0.5) {
        return { employee: best, certainty: Math.round(maxScore * 100), method: 'Nombre' };
      }
    }

    return null;
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFile(file);
    setProcessing(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      const detectedPages = [];

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str).join(' ');
        const data = parseDocumentData(text);
        const match = findBestMatch(data);

        detectedPages.push({
          index: i - 1,
          textSummary: text.substring(0, 100) + '...',
          extracted: data,
          match: match,
          selectedEmpId: match?.employee?.employeeNumber || '',
          included: !!match
        });
      }

      setPages(detectedPages);
    } catch (err) {
      setError(err.message);
    }
    setProcessing(false);
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);

    try {
      const toImport = pages.filter(p => p.included && p.selectedEmpId);
      let successCount = 0;

      for (const p of toImport) {
        // 1. Extraer página como PDF independiente
        const pageBlob = await extractPdfPage(file, p.index);
        const fileName = `${p.selectedEmpId}/${docType}_master_${Date.now()}.pdf`;

        // 2. Subir a Storage
        const { error: uploadError } = await supabase.storage
          .from('expedientes')
          .upload(fileName, pageBlob, { contentType: 'application/pdf', upsert: true });

        if (uploadError) throw uploadError;

        // 3. Actualizar base de datos
        const updateParams = {
          p_admin_employee_number: user.employeeNumber,
          p_employee_number: p.selectedEmpId,
        };
        if (docType === 'dc3') {
          updateParams.p_dc3_pdf_path = fileName;
          if (p.extracted.vigencia) updateParams.p_dc3_vigencia = p.extracted.vigencia;
        } else {
          updateParams.p_diploma_pdf_path = fileName;
          if (p.extracted.vigencia) updateParams.p_diploma_vigencia = p.extracted.vigencia;
        }

        const { data: updateRes, error: updateError } = await supabase.rpc('update_expediente', updateParams);
        if (updateError || !updateRes?.success) {
          console.warn(`Error updating employee ${p.selectedEmpId}:`, updateError || updateRes?.error);
        } else {
          successCount++;
        }
      }

      alert(`Importación completada: ${successCount} documentos asignados.`);
      if (onDone) onDone();
      onClose();
    } catch (err) {
      setError(err.message);
    }
    setImporting(false);
  };

  const updatePageMatch = (pageIndex, empId) => {
    setPages(prev => prev.map(p => {
      if (p.index === pageIndex) {
        const emp = employees.find(e => e.employeeNumber === empId);
        return { ...p, selectedEmpId: empId, included: !!empId };
      }
      return p;
    }));
  };

  const togglePageInclude = (pageIndex) => {
    setPages(prev => prev.map(p => p.index === pageIndex ? { ...p, included: !p.included } : p));
  };

  return (
    <div className="excel-import-overlay">
      <div className="excel-import-modal" style={{ maxWidth: '1000px' }}>
        <div className="excel-import-header">
          <h2>📄 {t('expMasterPdfTitle')}</h2>
          <button className="btn btn-sm btn-secondary" onClick={onClose}>✕</button>
        </div>

        <div className="excel-import-body">
          {error && <div className="alert alert-error">⚠️ {error}</div>}

          <div className="instructions-banner">
            <p>{t('expMasterPdfDesc')}</p>
          </div>

          {!file && (
            <div className="import-empty">
              <div className="form-field" style={{ marginBottom: '16px' }}>
                <label>{t('expDocType')}</label>
                <select value={docType} onChange={e => setDocType(e.target.value)} style={{ padding: '8px', borderRadius: '8px' }}>
                  <option value="dc3">{t('expDc3Title')}</option>
                  <option value="diploma">{t('expDiplomaTitle')}</option>
                </select>
              </div>
              <button className="btn btn-primary btn-lg" onClick={() => fileRef.current?.click()}>
                📂 {t('impSelectFile')}
              </button>
              <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFile} />
            </div>
          )}

          {processing && (
            <div className="loading-screen" style={{ minHeight: '200px' }}>
              <div className="loading-spinner">⏳</div>
              <p>{t('expMatchingEmployees')}</p>
            </div>
          )}

          {file && !processing && (
            <div className="import-preview">
              <div className="import-preview-info">
                <strong>{pages.length}</strong> {t('days')} (páginas) encontradas en <em>{file.name}</em>
              </div>

              <div className="import-table-wrap" style={{ maxHeight: '400px' }}>
                <table className="import-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}></th>
                      <th>Pág</th>
                      <th>Datos detectados</th>
                      <th>{t('expAssignTo')}</th>
                      <th>{t('expMatchCertainty')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map(p => (
                      <tr key={p.index} style={{ opacity: p.included ? 1 : 0.5 }}>
                        <td>
                          <input type="checkbox" checked={p.included} onChange={() => togglePageInclude(p.index)} />
                        </td>
                        <td>{p.index + 1}</td>
                        <td style={{ fontSize: '12px' }}>
                          <div><strong>{p.extracted.name || '—'}</strong></div>
                          <div style={{ color: 'var(--text-secondary)' }}>CURP: {p.extracted.curp || '—'}</div>
                          <div style={{ color: 'var(--text-secondary)' }}>Vig: {p.extracted.vigencia || '—'}</div>
                        </td>
                        <td>
                          <select
                            value={p.selectedEmpId}
                            onChange={e => updatePageMatch(p.index, e.target.value)}
                            style={{ padding: '4px', borderRadius: '4px', width: '100%' }}
                          >
                            <option value="">-- {t('expNoMatchFound')} --</option>
                            {employees.map(e => (
                              <option key={e.employeeNumber} value={e.employeeNumber}>
                                #{e.employeeNumber} - {e.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {p.match ? (
                            <span className="badge" style={{
                              background: p.match.certainty > 80 ? 'var(--success)' : 'var(--warning)',
                              color: 'white'
                            }}>
                              {p.match.certainty}% ({p.match.method})
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="form-actions">
                <button className="btn btn-secondary" onClick={() => { setFile(null); setPages([]); }}>
                  {t('back')}
                </button>
                <button className="btn btn-primary" onClick={handleImport} disabled={importing || !pages.some(p => p.included)}>
                  {importing ? '⏳...' : `📤 ${t('expProcessMasterPdf')} (${pages.filter(p => p.included).length})`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
