import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { supabase } from '../lib/supabase.js';
import { extractPdfPagesText, parseDocumentData, nameWordOverlapRatio, extractPhotoFromPdfPage } from '../utils/pdfExtract.js';
import { extractPdfPage } from '../utils/pdfSplit.js';

export default function MasterPdfImport({ onDone, onClose }) {
  const { user } = useAuth();
  const { t } = useLang();

  const [file, setFile] = useState(null);
  const [pages, setPages] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  // 'auto' detecta el tipo de documento por página (permite DC3 + Diploma mezclados
  // en el mismo PDF). 'dc3' / 'diploma' fuerza ese tipo para TODAS las páginas
  // (útil si el detector se equivoca en un lote homogéneo).
  const [docType, setDocType] = useState('auto');
  const [showRawText, setShowRawText] = useState(null); // index of page to show raw text

  const fileRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('list_expedientes');
      if (data?.success) setEmployees(data.employees || []);
    })();
  }, []);

  const findBestMatch = (extractedData, fullPageText) => {
    if (!extractedData.name && !extractedData.curp && !fullPageText) return null;

    // 1. Por CURP (exacto) — el método más confiable cuando está disponible
    if (extractedData.curp) {
      const match = employees.find(e => e.curp === extractedData.curp);
      if (match) return { employee: match, certainty: 100, method: 'CURP' };
    }

    // 2. Coincidencia de TODAS las palabras del nombre del empleado en el texto
    //    completo de la página, sin importar el orden (DC3 usa "Apellidos Nombre",
    //    los diplomas suelen usar "Nombre Apellidos"). Esto es más robusto que
    //    buscar una subcadena exacta.
    let bestOverlap = null;
    let bestOverlapScore = 0;
    for (const emp of employees) {
      if (!emp.name || emp.name.length <= 5) continue;
      const ratio = nameWordOverlapRatio(emp.name, fullPageText);
      if (ratio > bestOverlapScore) {
        bestOverlapScore = ratio;
        bestOverlap = emp;
      }
    }
    if (bestOverlap && bestOverlapScore >= 0.999) {
      return { employee: bestOverlap, certainty: 98, method: 'Nombre (todas las palabras)' };
    }

    // 3. Nombre extraído (fuzzy) contra el nombre del empleado
    if (extractedData.name) {
      const normalize = (s) => s?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim() || '';
      const normalizedExtracted = normalize(extractedData.name);

      let best = null;
      let maxScore = 0;

      employees.forEach(emp => {
        if (!emp.name) return;
        const normalizedEmp = normalize(emp.name);

        const wordsExt = normalizedExtracted.split(' ').filter(w => w.length > 2);
        const wordsEmp = normalizedEmp.split(' ').filter(w => w.length > 2);

        if (wordsExt.length === 0 || wordsEmp.length === 0) return;

        const common = wordsExt.filter(w => wordsEmp.includes(w));
        const score = (common.length * 2) / (wordsExt.length + wordsEmp.length);

        if (score > maxScore) {
          maxScore = score;
          best = emp;
        }
      });

      if (maxScore > 0.4) {
        return { employee: best, certainty: Math.round(maxScore * 100), method: 'Nombre Difuso' };
      }
    }

    // 4. Último recurso: mejor solapamiento parcial de palabras (si alcanza un mínimo)
    if (bestOverlap && bestOverlapScore >= 0.6) {
      return { employee: bestOverlap, certainty: Math.round(bestOverlapScore * 90), method: 'Nombre (parcial)' };
    }

    return null;
  };

  const handleFile = async (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    setFile(selected);
    setProcessing(true);
    setError(null);

    try {
      const pdfPages = await extractPdfPagesText(selected);
      const detectedPages = pdfPages.map(({ index, text }) => {
        const data = parseDocumentData(text);
        const match = findBestMatch(data, text);
        // Si el usuario forzó un tipo específico (dc3/diploma) se respeta; en
        // modo 'auto' se usa el tipo detectado por página (o 'dc3' si no se
        // pudo determinar, como valor por defecto conservador).
        const resolvedType = docType === 'auto'
          ? (data.docType === 'unknown' ? 'dc3' : data.docType)
          : docType;

        return {
          index,
          fullText: text,
          extracted: data,
          match,
          selectedEmpId: match?.employee?.employeeNumber || '',
          included: !!match,
          detectedType: data.docType,
          resolvedType,
        };
      });

      setPages(detectedPages);
    } catch (err) {
      console.error(err);
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
      const failures = [];

      for (const p of toImport) {
        const pageDocType = p.resolvedType === 'diploma' ? 'diploma' : 'dc3';

        // 1. Extraer página como PDF independiente
        const pageBlob = await extractPdfPage(file, p.index);
        const fileName = `${p.selectedEmpId}/${pageDocType}_master_${Date.now()}_${p.index}.pdf`;

        // 2. Subir a Storage
        const { error: uploadError } = await supabase.storage
          .from('expedientes')
          .upload(fileName, pageBlob, { contentType: 'application/pdf', upsert: true });

        if (uploadError) throw uploadError;

        // 3. Si es DC3, intentar extraer la fotografía embebida
        let photoPath = null;
        if (pageDocType === 'dc3') {
          try {
            const photoBlob = await extractPhotoFromPdfPage(file, p.index);
            if (photoBlob) {
              const photoName = `${p.selectedEmpId}/photo_master_${Date.now()}_${p.index}.jpg`;
              const { error: photoUploadError } = await supabase.storage
                .from('expedientes')
                .upload(photoName, photoBlob, { contentType: 'image/jpeg', upsert: true });
              if (!photoUploadError) {
                photoPath = photoName;
              }
            }
          } catch (e) {
            // No es crítico — seguir sin foto
            console.warn('No se pudo extraer foto del DC3 pág', p.index + 1, e);
          }
        }

        // 4. Actualizar base de datos.
        // IMPORTANTE: se envían SIEMPRE los 11 parámetros explícitamente
        // (los que no aplican van como null). Si no se envían todos,
        // PostgREST no puede resolver a cuál de las dos versiones de
        // update_expediente (9 params vs 11 params) llamar y responde con
        // el error PGRST203 "Could not choose the best candidate function".
        // Mientras se corra el DROP FUNCTION del fix SQL, esto es un workaround.
        const updateParams = {
          p_admin_employee_number: user.employeeNumber,
          p_employee_number: p.selectedEmpId,
          p_curp: null,
          p_rfc: null,
          p_nss: null,
          p_job_title: null,
          p_dc3_vigencia: null,
          p_diploma_vigencia: null,
          p_photo_path: photoPath,
          p_dc3_pdf_path: null,
          p_diploma_pdf_path: null,
        };
        if (pageDocType === 'dc3') {
          updateParams.p_dc3_pdf_path = fileName;
          if (p.extracted.vigencia) updateParams.p_dc3_vigencia = p.extracted.vigencia;
          // El CURP y el puesto solo aparecen en el DC3 (el diploma no los trae)
          if (p.extracted.curp) updateParams.p_curp = p.extracted.curp;
          if (p.extracted.jobTitle) updateParams.p_job_title = p.extracted.jobTitle;
          if (p.extracted.rfc) updateParams.p_rfc = p.extracted.rfc;
        } else {
          updateParams.p_diploma_pdf_path = fileName;
          if (p.extracted.vigencia) updateParams.p_diploma_vigencia = p.extracted.vigencia;
        }

        const { data: updateRes, error: updateError } = await supabase.rpc('update_expediente', updateParams);
        if (updateError || !updateRes?.success) {
          const reason = updateError?.message || updateRes?.error || 'error desconocido';
          console.warn(`Error updating employee ${p.selectedEmpId}:`, reason);
          failures.push(`Pág ${p.index + 1} (#${p.selectedEmpId}): ${reason}`);
        } else {
          successCount++;
        }
      }

      if (failures.length > 0) {
        setError(
          `Se asignaron ${successCount} de ${toImport.length} documentos. ` +
          `Fallaron ${failures.length}:\n` + failures.slice(0, 8).join('\n') +
          (failures.length > 8 ? `\n... y ${failures.length - 8} más` : '')
        );
      } else {
        alert(`Importación completada: ${successCount} documentos asignados.`);
        if (onDone) onDone();
        onClose();
      }
    } catch (err) {
      setError(err.message);
    }
    setImporting(false);
  };

  const updatePageMatch = (pageIndex, empId) => {
    setPages(prev => prev.map(p => {
      if (p.index === pageIndex) {
        return { ...p, selectedEmpId: empId, included: !!empId };
      }
      return p;
    }));
  };

  const updatePageType = (pageIndex, type) => {
    setPages(prev => prev.map(p => p.index === pageIndex ? { ...p, resolvedType: type } : p));
  };

  const togglePageInclude = (pageIndex) => {
    setPages(prev => prev.map(p => p.index === pageIndex ? { ...p, included: !p.included } : p));
  };

  return (
    <div className="excel-import-overlay">
      <div className="excel-import-modal" style={{ maxWidth: '1050px' }}>
        <div className="excel-import-header">
          <h2>📄 {t('expMasterPdfTitle')}</h2>
          <button className="btn btn-sm btn-secondary" onClick={onClose}>✕</button>
        </div>

        <div className="excel-import-body">
          {error && <div className="alert alert-error" style={{ whiteSpace: 'pre-line' }}>⚠️ {error}</div>}

          <div className="instructions-banner">
            <p>{t('expMasterPdfDesc')}</p>
          </div>

          {!file && (
            <div className="import-empty">
              <div className="form-field" style={{ marginBottom: '16px' }}>
                <label>{t('expDocType')}</label>
                <select value={docType} onChange={e => setDocType(e.target.value)} style={{ padding: '8px', borderRadius: '8px' }}>
                  <option value="auto">{t('expDocTypeAuto')}</option>
                  <option value="dc3">{t('expDc3Title')}</option>
                  <option value="diploma">{t('expDiplomaTitle')}</option>
                </select>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {t('expDocTypeAutoHint')}
                </p>
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

              {showRawText !== null && (
                <div style={{ position: 'absolute', inset: '20px', background: 'white', zIndex: 1000, padding: '20px', borderRadius: '12px', boxShadow: '0 0 40px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <h3>Texto extraído - Página {showRawText + 1}</h3>
                    <button className="btn btn-sm btn-secondary" onClick={() => setShowRawText(null)}>Cerrar</button>
                  </div>
                  <pre style={{ flex: 1, overflow: 'auto', background: '#f5f5f5', padding: '10px', fontSize: '11px', whiteSpace: 'pre-wrap' }}>
                    {pages[showRawText].fullText}
                  </pre>
                </div>
              )}

              <div className="import-table-wrap" style={{ maxHeight: '400px' }}>
                <table className="import-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}></th>
                      <th>Pág</th>
                      <th>Datos detectados</th>
                      <th>Tipo</th>
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
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <strong>{p.extracted.name || '—'}</strong>
                            <button className="btn-link" onClick={() => setShowRawText(p.index)} title="Ver texto extraído">👁️</button>
                          </div>
                          <div style={{ color: 'var(--text-secondary)' }}>CURP: {p.extracted.curp || '—'}</div>
                          {p.extracted.jobTitle && <div style={{ color: 'var(--text-secondary)' }}>Puesto: {p.extracted.jobTitle}</div>}
                          <div style={{ color: 'var(--text-secondary)' }}>Vig: {p.extracted.vigencia || '—'}</div>
                        </td>
                        <td>
                          <select
                            value={p.resolvedType}
                            onChange={e => updatePageType(p.index, e.target.value)}
                            style={{ padding: '4px', borderRadius: '4px' }}
                          >
                            <option value="dc3">{t('expDc3Title')}</option>
                            <option value="diploma">{t('expDiplomaTitle')}</option>
                          </select>
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
