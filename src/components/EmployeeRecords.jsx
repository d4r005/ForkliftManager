import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { supabase } from '../lib/supabase.js';
import { extractPdfText, parseDocumentData } from '../utils/pdfExtract.js';
import ExcelImport from './ExcelImport.jsx';

export default function EmployeeRecords() {
  const { user } = useAuth();
  const { t } = useLang();
  const isAdmin = user?.role === 'admin';

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [pdfViewer, setPdfViewer] = useState(null);
  const [alert, setAlert] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [extracting, setExtracting] = useState(false);

  const [editData, setEditData] = useState({
    employeeNumber: '', name: '', curp: '', rfc: '', nss: '', jobTitle: '',
    dc3Vigencia: '', diplomaVigencia: '',
    photoPath: null, dc3PdfPath: null, diplomaPdfPath: null,
  });

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null);

  const showAlert = useCallback((type, msg) => {
    setAlert({ type, msg });
    setTimeout(() => setAlert(null), 4000);
  }, []);

  const loadExpedientes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_expedientes');
      if (error) throw error;
      if (data?.success) setEmployees(data.employees || []);
    } catch (err) {
      showAlert('error', err.message);
    }
    setLoading(false);
  };

  useEffect(() => { loadExpedientes(); }, []);

  const handleEdit = (emp) => {
    setEditData({
      employeeNumber: emp.employeeNumber || '',
      name: emp.name || '',
      curp: emp.curp || '',
      rfc: emp.rfc || '',
      nss: emp.nss || '',
      jobTitle: emp.jobTitle || '',
      dc3Vigencia: emp.dc3Vigencia || '',
      diplomaVigencia: emp.diplomaVigencia || '',
      photoPath: emp.photoPath || null,
      dc3PdfPath: emp.dc3PdfPath || null,
      diplomaPdfPath: emp.diplomaPdfPath || null,
    });
    setExtractedData(null);
    setSelectedEmp(emp);
    setShowEditForm(true);
  };

  const handleFileSelect = (target) => {
    setUploadTarget(target);
    setExtractedData(null);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (uploadTarget === 'photo') {
      const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!photoTypes.includes(file.type)) {
        showAlert('error', t('expInvalidPhoto'));
        event.target.value = '';
        return;
      }
    } else {
      if (file.type !== 'application/pdf') {
        showAlert('error', t('expInvalidPdf'));
        event.target.value = '';
        return;
      }
    }

    if (file.size > 10 * 1024 * 1024) {
      showAlert('error', t('expFileTooLarge'));
      event.target.value = '';
      return;
    }

    // Si es DC3 o diploma, extraer texto del PDF
    let pdfData = null;
    if (uploadTarget === 'dc3' || uploadTarget === 'diploma') {
      setExtracting(true);
      try {
        const text = await extractPdfText(file);
        pdfData = parseDocumentData(text);
        if (pdfData.curp || pdfData.name || pdfData.vigencia) {
          setExtractedData({ ...pdfData, target: uploadTarget });
          showAlert('info', t('expDataExtracted'));
        }
      } catch (err) {
        console.warn('PDF extract error:', err);
      }
      setExtracting(false);
    }

    // Subir el archivo
    setUploading(true);
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const fileName = `${editData.employeeNumber}/${uploadTarget}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase
        .storage
        .from('expedientes')
        .upload(fileName, file, { contentType: file.type, upsert: true });

      if (uploadError) throw uploadError;

      const pathKey = uploadTarget === 'photo' ? 'photoPath' :
                     uploadTarget === 'dc3' ? 'dc3PdfPath' : 'diplomaPdfPath';
      setEditData(prev => ({ ...prev, [pathKey]: fileName }));
      showAlert('success', t('expUploadSuccess'));
    } catch (err) {
      showAlert('error', err.message);
    }
    setUploading(false);
    event.target.value = '';
  };

  // Aplicar datos extraídos del PDF al formulario
  const applyExtractedData = () => {
    if (!extractedData) return;
    setEditData(prev => ({
      ...prev,
      curp: extractedData.curp || prev.curp,
      rfc: extractedData.rfc || prev.rfc,
      name: extractedData.name || prev.name,
      dc3Vigencia: extractedData.target === 'dc3' ? (extractedData.vigencia || prev.dc3Vigencia) : prev.dc3Vigencia,
      diplomaVigencia: extractedData.target === 'diploma' ? (extractedData.vigencia || prev.diplomaVigencia) : prev.diplomaVigencia,
    }));
    setExtractedData(null);
    showAlert('success', t('expDataApplied'));
  };

  const handleSaveExpediente = async () => {
    try {
      const { data, error } = await supabase.rpc('update_expediente', {
        p_admin_employee_number: user.employeeNumber,
        p_employee_number: editData.employeeNumber,
        p_curp: editData.curp || null,
        p_rfc: editData.rfc || null,
        p_nss: editData.nss || null,
        p_job_title: editData.jobTitle || null,
        p_dc3_vigencia: editData.dc3Vigencia || null,
        p_diploma_vigencia: editData.diplomaVigencia || null,
        p_photo_path: editData.photoPath || null,
        p_dc3_pdf_path: editData.dc3PdfPath || null,
        p_diploma_pdf_path: editData.diplomaPdfPath || null,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error');

      showAlert('success', t('expSaved'));
      setShowEditForm(false);
      loadExpedientes();
    } catch (err) {
      showAlert('error', err.message);
    }
  };

  const handleRemoveFile = (target) => {
    const pathKey = target === 'photo' ? 'photoPath' :
                   target === 'dc3' ? 'dc3PdfPath' : 'diplomaPdfPath';
    setEditData(prev => ({ ...prev, [pathKey]: null }));
  };

  const viewPdf = async (filePath, title) => {
    try {
      const { data, error } = await supabase
        .storage
        .from('expedientes')
        .createSignedUrl(filePath, 60);
      if (error) throw error;
      setPdfViewer({ url: data.signedUrl, title, expires: Date.now() + 55000 });
    } catch (err) {
      showAlert('error', err.message);
    }
  };

  useEffect(() => {
    if (!pdfViewer) return;
    const timer = setTimeout(() => {
      setPdfViewer(null);
      showAlert('warning', t('expLinkExpired'));
    }, 55000);
    return () => clearTimeout(timer);
  }, [pdfViewer]);

  const handleContextMenu = (e) => { e.preventDefault(); return false; };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const isVigenciaValid = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d >= today;
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">M</div>
        <p>{t('authLoading')}</p>
      </div>
    );
  }

  // Excel Import modal
  if (showExcelImport) {
    return (
      <ExcelImport
        onDone={() => loadExpedientes()}
        onClose={() => setShowExcelImport(false)}
      />
    );
  }

  // PDF Viewer (restricted)
  if (pdfViewer) {
    return (
      <div className="pdf-viewer-overlay" onContextMenu={handleContextMenu} onCopy={(e) => e.preventDefault()}>
        <div className="pdf-viewer-header">
          <div className="pdf-viewer-title">🔒 {pdfViewer.title}</div>
          <div className="pdf-viewer-actions">
            <span className="pdf-viewer-timer">
              ⏱ {Math.ceil((pdfViewer.expires - Date.now()) / 1000)}s
            </span>
            <button className="btn btn-sm btn-secondary" onClick={() => setPdfViewer(null)}>
              ✕ {t('close')}
            </button>
          </div>
        </div>
        <div className="pdf-viewer-watermark">
          {user?.name} #{user?.employeeNumber} — {new Date().toLocaleString('es-MX')}
        </div>
        <iframe src={pdfViewer.url} className="pdf-viewer-frame" title={pdfViewer.title} onContextMenu={handleContextMenu} />
        <div className="pdf-viewer-notice">🔒 {t('expViewerNotice')}</div>
      </div>
    );
  }

  // EDIT FORM
  if (showEditForm && isAdmin) {
    return (
      <div className="expedientes">
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          accept={uploadTarget === 'photo' ? 'image/jpeg,image/png,image/webp' : 'application/pdf'}
          onChange={handleFileUpload}
        />

        {alert && <div className={`alert alert-${alert.type}`}>{alert.type === 'success' ? '✅ ' : alert.type === 'info' ? 'ℹ️ ' : '⚠️ '}{alert.msg}</div>}

        <div className="expediente-edit">
          <div className="section-header">
            <h2>📁 {t('expEditTitle')} — {editData.employeeNumber}</h2>
            <button className="btn btn-secondary" onClick={() => setShowEditForm(false)}>← {t('back')}</button>
          </div>

          {/* Datos extraídos del PDF - aplicar al formulario */}
          {extractedData && (
            <div className="extracted-data-banner">
              <div className="extracted-title">🔍 {t('expDataFound')}</div>
              <div className="extracted-fields">
                {extractedData.name && <div className="extracted-field"><span>{t('expName')}:</span> {extractedData.name}</div>}
                {extractedData.curp && <div className="extracted-field"><span>CURP:</span> {extractedData.curp}</div>}
                {extractedData.rfc && <div className="extracted-field"><span>RFC:</span> {extractedData.rfc}</div>}
                {extractedData.vigencia && <div className="extracted-field"><span>{t('expVigencia')}:</span> {extractedData.vigencia}</div>}
              </div>
              <button className="btn btn-sm btn-primary" onClick={applyExtractedData}>
                ✅ {t('expApplyData')}
              </button>
            </div>
          )}

          {extracting && (
            <div className="upload-progress">
              <div className="loading-spinner" style={{ width: 20, height: 20 }}>⏳</div>
              <span>{t('expExtracting')}</span>
            </div>
          )}

          <div className="expediente-edit-grid">
            <div className="expediente-photo-section">
              <label>{t('expPhoto')}</label>
              <div className="photo-preview">
                {editData.photoPath ? (
                  <PhotoThumb path={editData.photoPath} />
                ) : (
                  <div className="photo-placeholder">👤</div>
                )}
              </div>
              {editData.photoPath ? (
                <button className="btn btn-sm btn-danger" onClick={() => handleRemoveFile('photo')}>🗑️ {t('expRemove')}</button>
              ) : (
                <button className="btn btn-sm btn-primary" onClick={() => handleFileSelect('photo')} disabled={uploading}>📷 {t('expUploadPhoto')}</button>
              )}
            </div>

            <div className="expediente-data-section">
              <div className="form-grid">
                <div className="form-field">
                  <label>{t('expEmployeeNumber')}</label>
                  <input type="text" value={editData.employeeNumber} disabled />
                </div>
                <div className="form-field">
                  <label>{t('expName')}</label>
                  <input type="text" value={editData.name} disabled />
                </div>
                <div className="form-field">
                  <label>{t('expCurp')}</label>
                  <input type="text" value={editData.curp} maxLength={18}
                    onChange={e => setEditData(prev => ({ ...prev, curp: e.target.value.toUpperCase() }))}
                    placeholder="AAAA000000AAAAAA00" />
                </div>
                <div className="form-field">
                  <label>{t('expRfc')}</label>
                  <input type="text" value={editData.rfc} maxLength={13}
                    onChange={e => setEditData(prev => ({ ...prev, rfc: e.target.value.toUpperCase() }))}
                    placeholder="AAAA000000AAA" />
                </div>
                <div className="form-field">
                  <label>NSS</label>
                  <input type="text" value={editData.nss} maxLength={11}
                    onChange={e => setEditData(prev => ({ ...prev, nss: e.target.value }))}
                    placeholder="12345678901" />
                </div>
                <div className="form-field">
                  <label>{t('expJobTitle')}</label>
                  <input type="text" value={editData.jobTitle}
                    onChange={e => setEditData(prev => ({ ...prev, jobTitle: e.target.value }))}
                    placeholder="Montacarguista" />
                </div>
                <div className="form-field">
                  <label>{t('expDc3Vigencia')}</label>
                  <input type="date" value={editData.dc3Vigencia}
                    onChange={e => setEditData(prev => ({ ...prev, dc3Vigencia: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label>{t('expDiplomaVigencia')}</label>
                  <input type="date" value={editData.diplomaVigencia}
                    onChange={e => setEditData(prev => ({ ...prev, diplomaVigencia: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          <div className="expediente-docs">
            <h3>📄 {t('expDocuments')}</h3>
            <div className="docs-grid">
              <DocUploadCard
                icon="📜" title={t('expDc3Title')}
                hasFile={!!editData.dc3PdfPath}
                onUpload={() => handleFileSelect('dc3')}
                onRemove={() => handleRemoveFile('dc3')}
                t={t} uploading={uploading}
                extractHint={t('expPdfAutoFill')}
              />
              <DocUploadCard
                icon="🎓" title={t('expDiplomaTitle')}
                hasFile={!!editData.diplomaPdfPath}
                onUpload={() => handleFileSelect('diploma')}
                onRemove={() => handleRemoveFile('diploma')}
                t={t} uploading={uploading}
                extractHint={t('expPdfAutoFill')}
              />
            </div>
          </div>

          {uploading && (
            <div className="upload-progress">
              <div className="loading-spinner" style={{ width: 20, height: 20 }}>⏳</div>
              <span>{t('expUploading')}</span>
            </div>
          )}

          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowEditForm(false)}>{t('cancel')}</button>
            <button className="btn btn-primary" onClick={handleSaveExpediente}>💾 {t('expSave')}</button>
          </div>
        </div>
      </div>
    );
  }

  // EXPEDIENTE VIEW
  if (selectedEmp) {
    return (
      <div className="expedientes">
        {alert && <div className={`alert alert-${alert.type}`}>{alert.type === 'success' ? '✅ ' : '⚠️ '}{alert.msg}</div>}

        <div className="expediente-view">
          <div className="section-header">
            <h2>📁 {t('expTitle')} — {selectedEmp.employeeNumber}</h2>
            <div className="section-header-actions">
              {isAdmin && <button className="btn btn-primary" onClick={() => handleEdit(selectedEmp)}>✏️ {t('expEdit')}</button>}
              <button className="btn btn-secondary" onClick={() => setSelectedEmp(null)}>← {t('back')}</button>
            </div>
          </div>

          <div className="expediente-view-grid">
            <div className="expediente-view-photo">
              {selectedEmp.photoPath ? (
                <PhotoThumb path={selectedEmp.photoPath} large />
              ) : (
                <div className="photo-placeholder large">👤</div>
              )}
            </div>
            <div className="expediente-view-data">
              <ExpDataRow label={t('expName')} value={selectedEmp.name || '—'} />
              <ExpDataRow label={t('expEmployeeNumber')} value={selectedEmp.employeeNumber} />
              <ExpDataRow label={t('expJobTitle')} value={selectedEmp.jobTitle || '—'} />
              <ExpDataRow label="NSS" value={selectedEmp.nss || '—'} />
              <ExpDataRow label={t('expCurp')} value={selectedEmp.curp || '—'} />
              <ExpDataRow label={t('expRfc')} value={selectedEmp.rfc || '—'} />
              <div className="exp-data-row">
                <span className="exp-data-label">{t('expDc3Vigencia')}:</span>
                <span className="exp-data-value">
                  <span className={`vigencia-badge ${isVigenciaValid(selectedEmp.dc3Vigencia) === true ? 'valid' : isVigenciaValid(selectedEmp.dc3Vigencia) === false ? 'expired' : 'none'}`}>
                    {formatDate(selectedEmp.dc3Vigencia)}
                  </span>
                </span>
              </div>
              <div className="exp-data-row">
                <span className="exp-data-label">{t('expDiplomaVigencia')}:</span>
                <span className="exp-data-value">
                  <span className={`vigencia-badge ${isVigenciaValid(selectedEmp.diplomaVigencia) === true ? 'valid' : isVigenciaValid(selectedEmp.diplomaVigencia) === false ? 'expired' : 'none'}`}>
                    {formatDate(selectedEmp.diplomaVigencia)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="expediente-view-docs">
            <h3>📄 {t('expDocuments')}</h3>
            <div className="docs-grid">
              <div className="doc-card">
                <div className="doc-header">
                  <span className="doc-icon">📜</span>
                  <span className="doc-title">{t('expDc3Title')}</span>
                </div>
                <div className="doc-actions">
                  {selectedEmp.dc3PdfPath ? (
                    <button className="btn btn-sm btn-primary" onClick={() => viewPdf(selectedEmp.dc3PdfPath, t('expDc3Title'))}>
                      👁️ {t('expView')}
                    </button>
                  ) : (
                    <span className="doc-status doc-missing">⬜ {t('expNoFile')}</span>
                  )}
                </div>
              </div>
              <div className="doc-card">
                <div className="doc-header">
                  <span className="doc-icon">🎓</span>
                  <span className="doc-title">{t('expDiplomaTitle')}</span>
                </div>
                <div className="doc-actions">
                  {selectedEmp.diplomaPdfPath ? (
                    <button className="btn btn-sm btn-primary" onClick={() => viewPdf(selectedEmp.diplomaPdfPath, t('expDiplomaTitle'))}>
                      👁️ {t('expView')}
                    </button>
                  ) : (
                    <span className="doc-status doc-missing">⬜ {t('expNoFile')}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="expedientes">
      {alert && <div className={`alert alert-${alert.type}`}>{alert.type === 'success' ? '✅ ' : '⚠️ '}{alert.msg}</div>}

      <div className="expediente-list">
        <div className="section-header">
          <h2>📁 {t('expTitle')}</h2>
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => setShowExcelImport(true)}>
              📊 {t('impTitle')}
            </button>
          )}
        </div>

        <div className="expediente-warning">🔒 {t('expSecurityNotice')}</div>

        {employees.length === 0 ? (
          <div className="empty-mini"><p>{t('expNoRecords')}</p></div>
        ) : (
          <div className="expediente-cards">
            {employees.map(emp => {
              const dc3Valid = isVigenciaValid(emp.dc3Vigencia);
              const diplomaValid = isVigenciaValid(emp.diplomaVigencia);
              return (
                <div key={emp.employeeNumber} className="expediente-card" onClick={() => setSelectedEmp(emp)}>
                  <div className="exp-card-photo">
                    {emp.photoPath ? <PhotoThumb path={emp.photoPath} /> : <div className="photo-placeholder">👤</div>}
                  </div>
                  <div className="exp-card-body">
                    <div className="exp-card-name">
                      <strong>{emp.name || emp.employeeNumber}</strong>
                      <span className="badge">#{emp.employeeNumber}</span>
                    </div>
                    <div className="exp-card-meta">
                      {dc3Valid !== null && (
                        <span className={`vigencia-badge ${dc3Valid ? 'valid' : 'expired'}`}>
                          DC3: {formatDate(emp.dc3Vigencia)}
                        </span>
                      )}
                      {diplomaValid !== null && (
                        <span className={`vigencia-badge ${diplomaValid ? 'valid' : 'expired'}`}>
                          🎓: {formatDate(emp.diplomaVigencia)}
                        </span>
                      )}
                      {dc3Valid === null && diplomaValid === null && (
                        <span className="vigencia-badge none">{t('expIncomplete')}</span>
                      )}
                    </div>
                  </div>
                  <div className="exp-card-action">👁️</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Sub-componentes =====

function DocUploadCard({ icon, title, hasFile, onUpload, onRemove, t, uploading, extractHint }) {
  return (
    <div className="doc-card">
      <div className="doc-header">
        <span className="doc-icon">{icon}</span>
        <span className="doc-title">{title}</span>
      </div>
      {extractHint && <div className="doc-hint">💡 {extractHint}</div>}
      <div className="doc-actions">
        {hasFile ? (
          <>
            <span className="doc-status doc-uploaded">✅ {t('expUploaded')}</span>
            <button className="btn btn-sm btn-danger" onClick={onRemove}>🗑️ {t('expRemove')}</button>
            <button className="btn btn-sm btn-secondary" onClick={onUpload} disabled={uploading}>🔄 {t('expReplace')}</button>
          </>
        ) : (
          <>
            <span className="doc-status doc-missing">⬜ {t('expNoFile')}</span>
            <button className="btn btn-sm btn-primary" onClick={onUpload} disabled={uploading}>📤 {t('expUpload')}</button>
          </>
        )}
      </div>
    </div>
  );
}

function ExpDataRow({ label, value }) {
  return (
    <div className="exp-data-row">
      <span className="exp-data-label">{label}:</span>
      <span className="exp-data-value">{value}</span>
    </div>
  );
}

function PhotoThumb({ path, large }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase.storage.from('expedientes').createSignedUrl(path, 300);
        if (active) {
          if (error) setErr(true);
          else setUrl(data.signedUrl);
        }
      } catch { if (active) setErr(true); }
    })();
    return () => { active = false; };
  }, [path]);

  if (err || !url) return <div className="photo-placeholder">👤</div>;
  return (
    <img src={url} alt="Foto" className={large ? 'photo-large' : 'photo-thumb'}
      onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} />
  );
}
