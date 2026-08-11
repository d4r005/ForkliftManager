import { useState, useRef, useCallback, useEffect } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { extractTextFromImage, parseForkliftPlateData } from '../utils/ocrExtract.js';

export default function ForkliftManager({ forklifts, onAdd, onUpdate, onDelete }) {
  const { t } = useLang();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor';

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedForklift, setSelectedForklift] = useState(null);
  const [alert, setAlert] = useState(null);

  const [formData, setFormData] = useState({
    idCode: '', name: '', brand: '', model: '', serialNumber: '',
    capacity: '', capacityUnit: 'kg', powerType: '', mastType: '',
    maxLiftHeight: '', tireType: '', manufactureYear: '', voltage: '',
    weight: '', notes: '', photoPath: null, platePhotoPath: null,
  });

  const [uploading, setUploading] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [extractedData, setExtractedData] = useState(null);
  const photoInputRef = useRef(null);
  const plateInputRef = useRef(null);
  const fileTarget = useRef(null);

  const showAlert = useCallback((type, msg) => {
    setAlert({ type, msg });
    setTimeout(() => setAlert(null), 4000);
  }, []);

  const resetForm = () => {
    setFormData({
      idCode: '', name: '', brand: '', model: '', serialNumber: '',
      capacity: '', capacityUnit: 'kg', powerType: '', mastType: '',
      maxLiftHeight: '', tireType: '', manufactureYear: '', voltage: '',
      weight: '', notes: '', photoPath: null, platePhotoPath: null,
    });
    setExtractedData(null);
    setEditingId(null);
  };

  const handleAddNew = () => {
    resetForm();
    setShowForm(true);
  };

  const handleEdit = (forklift) => {
    setFormData({
      idCode: forklift.idCode || '',
      name: forklift.name || '',
      brand: forklift.brand || '',
      model: forklift.model || '',
      serialNumber: forklift.serialNumber || '',
      capacity: forklift.capacity || '',
      capacityUnit: forklift.capacityUnit || 'kg',
      powerType: forklift.powerType || '',
      mastType: forklift.mastType || '',
      maxLiftHeight: forklift.maxLiftHeight || '',
      tireType: forklift.tireType || '',
      manufactureYear: forklift.manufactureYear || '',
      voltage: forklift.voltage || '',
      weight: forklift.weight || '',
      notes: forklift.notes || '',
      photoPath: forklift.photoPath || null,
      platePhotoPath: forklift.platePhotoPath || null,
    });
    setEditingId(forklift.id);
    setExtractedData(null);
    setShowForm(true);
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // === File upload ===
  const handleFileSelect = (target) => {
    fileTarget.current = target;
    setExtractedData(null);
    if (target === 'photo') {
      photoInputRef.current?.click();
    } else {
      plateInputRef.current?.click();
    }
  };

  const uploadFile = async (file, subPath) => {
    const ext = file.name.split('.').pop().toLowerCase();
    const fileName = `${subPath}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase
      .storage.from('expedientes')
      .upload(fileName, file, { contentType: file.type, upsert: true });
    if (uploadError) throw uploadError;
    return fileName;
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showAlert('error', t('fkInvalidImage'));
      event.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showAlert('error', t('fkFileTooLarge'));
      event.target.value = '';
      return;
    }

    const target = fileTarget.current;
    setUploading(true);

    // Si es placa de datos, correr OCR
    if (target === 'plate') {
      setOcrProcessing(true);
      setOcrProgress(0);
      try {
        const text = await extractTextFromImage(file, (p) => setOcrProgress(p));
        const parsed = parseForkliftPlateData(text);
        if (parsed._foundCount > 0) {
          setExtractedData(parsed);
          showAlert('info', t('fkOcrDataFound'));
        } else {
          showAlert('warning', t('fkOcrNoData'));
        }
      } catch (err) {
        console.error('OCR error:', err);
        showAlert('warning', t('fkOcrError'));
      }
      setOcrProcessing(false);
    }

    // Subir archivo
    try {
      const subPath = editingId ? `forklifts/${editingId}` : `forklifts/temp_${Date.now()}`;
      const path = await uploadFile(file, subPath);

      if (target === 'photo') {
        updateField('photoPath', path);
      } else {
        updateField('platePhotoPath', path);
      }
      showAlert('success', t('fkUploadSuccess'));
    } catch (err) {
      showAlert('error', err.message);
    }
    setUploading(false);
    event.target.value = '';
  };

  const applyExtractedData = () => {
    if (!extractedData) return;
    setFormData(prev => ({
      ...prev,
      brand: extractedData.brand || prev.brand,
      model: extractedData.model || prev.model,
      serialNumber: extractedData.serialNumber || prev.serialNumber,
      capacity: extractedData.capacity || prev.capacity,
      capacityUnit: (extractedData.capacityUnit || prev.capacityUnit).toLowerCase(),
      powerType: extractedData.powerType || prev.powerType,
      mastType: extractedData.mastType || prev.mastType,
      maxLiftHeight: extractedData.maxLiftHeight || prev.maxLiftHeight,
      tireType: extractedData.tireType || prev.tireType,
      manufactureYear: extractedData.manufactureYear || prev.manufactureYear,
      voltage: extractedData.voltage || prev.voltage,
      weight: extractedData.weight || prev.weight,
    }));
    setExtractedData(null);
    showAlert('success', t('fkDataApplied'));
  };

  const handleSave = async () => {
    if (!formData.idCode.trim()) {
      showAlert('error', t('fkIdRequired'));
      return;
    }

    try {
      if (editingId) {
        await onUpdate(editingId, {
          idCode: formData.idCode.trim(),
          name: formData.name.trim(),
          brand: formData.brand.trim(),
          model: formData.model.trim(),
          serialNumber: formData.serialNumber.trim(),
          capacity: formData.capacity.trim(),
          capacityUnit: formData.capacityUnit,
          powerType: formData.powerType,
          mastType: formData.mastType,
          maxLiftHeight: formData.maxLiftHeight.trim(),
          tireType: formData.tireType,
          manufactureYear: formData.manufactureYear.trim(),
          voltage: formData.voltage.trim(),
          weight: formData.weight.trim(),
          notes: formData.notes.trim(),
          photoPath: formData.photoPath,
          platePhotoPath: formData.platePhotoPath,
        });
        showAlert('success', t('fkUpdated'));
      } else {
        await onAdd({
          id: formData.idCode.trim(),
          name: formData.name.trim(),
          brand: formData.brand.trim(),
          model: formData.model.trim(),
          serialNumber: formData.serialNumber.trim(),
          capacity: formData.capacity.trim(),
          capacityUnit: formData.capacityUnit,
          powerType: formData.powerType,
          mastType: formData.mastType,
          maxLiftHeight: formData.maxLiftHeight.trim(),
          tireType: formData.tireType,
          manufactureYear: formData.manufactureYear.trim(),
          voltage: formData.voltage.trim(),
          weight: formData.weight.trim(),
          notes: formData.notes.trim(),
          photoPath: formData.photoPath,
          platePhotoPath: formData.platePhotoPath,
        });
        showAlert('success', t('fkSaved'));
      }
      setShowForm(false);
      resetForm();
    } catch (err) {
      showAlert('error', err.message);
    }
  };

  const handleRemovePhoto = (target) => {
    if (target === 'photo') updateField('photoPath', null);
    else updateField('platePhotoPath', null);
  };

  // === FORM / EDIT VIEW ===
  if (showForm) {
    return (
      <div className="forklift-manager">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <input
          ref={plateInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {alert && <div className={`alert alert-${alert.type}`}>{alert.type === 'success' ? '✅ ' : alert.type === 'info' ? 'ℹ️ ' : alert.type === 'warning' ? '⚠️ ' : '❌ '}{alert.msg}</div>}

        <div className="fk-edit-panel">
          <div className="section-header">
            <h2>{editingId ? `✏️ ${t('fkEdit')}` : `➕ ${t('fkAddNew')}`}</h2>
            <button className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>← {t('back')}</button>
          </div>

          {/* OCR progress */}
          {ocrProcessing && (
            <div className="fk-ocr-progress">
              <div className="loading-spinner" style={{ width: 24, height: 24 }}>⏳</div>
              <span>{t('fkOcrProcessing')} {Math.round(ocrProgress * 100)}%</span>
            </div>
          )}

          {/* Extracted data banner */}
          {extractedData && (
            <div className="extracted-data-banner">
              <div className="extracted-title">🔍 {t('fkOcrDataFound')}</div>
              <div className="extracted-fields">
                {extractedData.brand && <div className="extracted-field"><span>{t('fkBrand')}:</span> {extractedData.brand}</div>}
                {extractedData.model && <div className="extracted-field"><span>{t('fkModel')}:</span> {extractedData.model}</div>}
                {extractedData.serialNumber && <div className="extracted-field"><span>{t('fkSerial')}:</span> {extractedData.serialNumber}</div>}
                {extractedData.capacity && <div className="extracted-field"><span>{t('fkCapacity')}:</span> {extractedData.capacity} {extractedData.capacityUnit}</div>}
                {extractedData.powerType && <div className="extracted-field"><span>{t('fkPower')}:</span> {extractedData.powerType}</div>}
                {extractedData.mastType && <div className="extracted-field"><span>{t('fkMast')}:</span> {extractedData.mastType}</div>}
                {extractedData.maxLiftHeight && <div className="extracted-field"><span>{t('fkLiftHeight')}:</span> {extractedData.maxLiftHeight} mm</div>}
                {extractedData.tireType && <div className="extracted-field"><span>{t('fkTires')}:</span> {extractedData.tireType}</div>}
                {extractedData.manufactureYear && <div className="extracted-field"><span>{t('fkYear')}:</span> {extractedData.manufactureYear}</div>}
                {extractedData.voltage && <div className="extracted-field"><span>{t('fkVoltage')}:</span> {extractedData.voltage}V</div>}
                {extractedData.weight && <div className="extracted-field"><span>{t('fkWeight')}:</span> {extractedData.weight} kg</div>}
              </div>
              <button className="btn btn-sm btn-primary" onClick={applyExtractedData}>
                ✅ {t('fkApplyData')}
              </button>
            </div>
          )}

          {/* Photos section */}
          <div className="fk-photos-section">
            <div className="fk-photo-card">
              <label className="fk-photo-label">📷 {t('fkPhoto')}</label>
              <div className="fk-photo-preview">
                {formData.photoPath ? (
                  <ForkliftPhoto path={formData.photoPath} />
                ) : (
                  <div className="fk-photo-placeholder">🚜</div>
                )}
              </div>
              {formData.photoPath ? (
                <div className="fk-photo-actions">
                  <button className="btn btn-sm btn-secondary" onClick={() => handleFileSelect('photo')} disabled={uploading}>🔄</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleRemovePhoto('photo')}>🗑️</button>
                </div>
              ) : (
                <button className="btn btn-sm btn-primary" onClick={() => handleFileSelect('photo')} disabled={uploading}>
                  📷 {t('fkUploadPhoto')}
                </button>
              )}
            </div>

            <div className="fk-photo-card">
              <label className="fk-photo-label">🏷️ {t('fkPlatePhoto')}</label>
              <div className="fk-photo-preview">
                {formData.platePhotoPath ? (
                  <ForkliftPhoto path={formData.platePhotoPath} />
                ) : (
                  <div className="fk-photo-placeholder">🏷️</div>
                )}
              </div>
              {formData.platePhotoPath ? (
                <div className="fk-photo-actions">
                  <button className="btn btn-sm btn-secondary" onClick={() => handleFileSelect('plate')} disabled={uploading}>🔄</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleRemovePhoto('plate')}>🗑️</button>
                </div>
              ) : (
                <button className="btn btn-sm btn-primary" onClick={() => handleFileSelect('plate')} disabled={uploading || ocrProcessing}>
                  📷 {t('fkUploadPlate')}
                </button>
              )}
              <div className="doc-hint">💡 {t('fkPlateHint')}</div>
            </div>
          </div>

          {uploading && (
            <div className="upload-progress">
              <div className="loading-spinner" style={{ width: 20, height: 20 }}>⏳</div>
              <span>{t('fkUploading')}</span>
            </div>
          )}

          {/* Equipment data form */}
          <div className="fk-data-form">
            <h3>📋 {t('fkEquipmentData')}</h3>
            <div className="form-grid">
              <div className="form-field">
                <label>{t('forkliftId')} *</label>
                <input type="text" value={formData.idCode}
                  onChange={e => updateField('idCode', e.target.value)}
                  placeholder={t('forkliftIdPlaceholder')} disabled={!!editingId} />
              </div>
              <div className="form-field">
                <label>{t('forkliftName')}</label>
                <input type="text" value={formData.name}
                  onChange={e => updateField('name', e.target.value)}
                  placeholder={t('fkNamePlaceholder')} />
              </div>
              <div className="form-field">
                <label>{t('fkBrand')}</label>
                <input type="text" value={formData.brand}
                  onChange={e => updateField('brand', e.target.value)}
                  placeholder="Toyota, Clark, Hyster..." />
              </div>
              <div className="form-field">
                <label>{t('fkModel')}</label>
                <input type="text" value={formData.model}
                  onChange={e => updateField('model', e.target.value)}
                  placeholder="8FGCU25, GC025..." />
              </div>
              <div className="form-field">
                <label>{t('fkSerial')}</label>
                <input type="text" value={formData.serialNumber}
                  onChange={e => updateField('serialNumber', e.target.value)}
                  placeholder="S/N..." />
              </div>
              <div className="form-field form-field-row">
                <div>
                  <label>{t('fkCapacity')}</label>
                  <input type="text" value={formData.capacity}
                    onChange={e => updateField('capacity', e.target.value)}
                    placeholder="2500" />
                </div>
                <div>
                  <label>Unidad</label>
                  <select value={formData.capacityUnit}
                    onChange={e => updateField('capacityUnit', e.target.value)}>
                    <option value="kg">kg</option>
                    <option value="lbs">lbs</option>
                    <option value="ton">ton</option>
                  </select>
                </div>
              </div>
              <div className="form-field">
                <label>{t('fkPower')}</label>
                <select value={formData.powerType}
                  onChange={e => updateField('powerType', e.target.value)}>
                  <option value="">—</option>
                  <option value="Eléctrico">⚡ Eléctrico</option>
                  <option value="Diesel">⛽ Diesel</option>
                  <option value="Gasolina">⛽ Gasolina</option>
                  <option value="GLP">🔥 GLP</option>
                </select>
              </div>
              <div className="form-field">
                <label>{t('fkMast')}</label>
                <select value={formData.mastType}
                  onChange={e => updateField('mastType', e.target.value)}>
                  <option value="">—</option>
                  <option value="Simple">Simple</option>
                  <option value="Dúplex">Dúplex</option>
                  <option value="Tríplex">Tríplex</option>
                  <option value="Quádruple">Quádruple</option>
                </select>
              </div>
              <div className="form-field">
                <label>{t('fkLiftHeight')} (mm)</label>
                <input type="text" value={formData.maxLiftHeight}
                  onChange={e => updateField('maxLiftHeight', e.target.value)}
                  placeholder="4500" />
              </div>
              <div className="form-field">
                <label>{t('fkTires')}</label>
                <select value={formData.tireType}
                  onChange={e => updateField('tireType', e.target.value)}>
                  <option value="">—</option>
                  <option value="Neumáticas">Neumáticas</option>
                  <option value="Sólidas">Sólidas</option>
                  <option value="Poliuretano">Poliuretano</option>
                </select>
              </div>
              <div className="form-field">
                <label>{t('fkYear')}</label>
                <input type="text" value={formData.manufactureYear}
                  onChange={e => updateField('manufactureYear', e.target.value)}
                  placeholder="2020" maxLength={4} />
              </div>
              <div className="form-field">
                <label>{t('fkVoltage')} (V)</label>
                <input type="text" value={formData.voltage}
                  onChange={e => updateField('voltage', e.target.value)}
                  placeholder="48 / 80" />
              </div>
              <div className="form-field">
                <label>{t('fkWeight')} (kg)</label>
                <input type="text" value={formData.weight}
                  onChange={e => updateField('weight', e.target.value)}
                  placeholder="3500" />
              </div>
            </div>
            <div className="form-field" style={{ marginTop: 12 }}>
              <label>{t('fkNotes')}</label>
              <textarea value={formData.notes}
                onChange={e => updateField('notes', e.target.value)}
                placeholder={t('fkNotesPlaceholder')}
                rows={3} />
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>{t('cancel')}</button>
            <button className="btn btn-primary" onClick={handleSave}>💾 {t('saveForklift')}</button>
          </div>
        </div>
      </div>
    );
  }

  // === DETAIL VIEW ===
  if (selectedForklift) {
    const f = selectedForklift;
    return (
      <div className="forklift-manager">
        {alert && <div className={`alert alert-${alert.type}`}>{alert.type === 'success' ? '✅ ' : '⚠️ '}{alert.msg}</div>}

        <div className="fk-detail">
          <div className="section-header">
            <h2>🚜 {f.idCode}{f.name ? ` — ${f.name}` : ''}</h2>
            <div className="section-header-actions">
              {isAdmin && <button className="btn btn-primary" onClick={() => { setSelectedForklift(null); handleEdit(f); }}>✏️ {t('fkEdit')}</button>}
              <button className="btn btn-secondary" onClick={() => setSelectedForklift(null)}>← {t('back')}</button>
            </div>
          </div>

          <div className="fk-detail-grid">
            <div className="fk-detail-photos">
              <div className="fk-detail-photo-block">
                <label>📷 {t('fkPhoto')}</label>
                {f.photoPath ? <ForkliftPhoto path={f.photoPath} large /> : <div className="fk-photo-placeholder large">🚜</div>}
              </div>
              <div className="fk-detail-photo-block">
                <label>🏷️ {t('fkPlatePhoto')}</label>
                {f.platePhotoPath ? <ForkliftPhoto path={f.platePhotoPath} large /> : <div className="fk-photo-placeholder large">🏷️</div>}
              </div>
            </div>
            <div className="fk-detail-data">
              <DetailRow label={t('fkBrand')} value={f.brand} />
              <DetailRow label={t('fkModel')} value={f.model} />
              <DetailRow label={t('fkSerial')} value={f.serialNumber} />
              <DetailRow label={t('fkCapacity')} value={f.capacity ? `${f.capacity} ${f.capacityUnit || 'kg'}` : null} />
              <DetailRow label={t('fkPower')} value={f.powerType} />
              <DetailRow label={t('fkMast')} value={f.mastType} />
              <DetailRow label={t('fkLiftHeight')} value={f.maxLiftHeight ? `${f.maxLiftHeight} mm` : null} />
              <DetailRow label={t('fkTires')} value={f.tireType} />
              <DetailRow label={t('fkYear')} value={f.manufactureYear} />
              <DetailRow label={t('fkVoltage')} value={f.voltage ? `${f.voltage} V` : null} />
              <DetailRow label={t('fkWeight')} value={f.weight ? `${f.weight} kg` : null} />
              {f.notes && <div className="fk-detail-notes"><label>{t('fkNotes')}</label><p>{f.notes}</p></div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // === LIST VIEW ===
  return (
    <div className="forklift-manager">
      {alert && <div className={`alert alert-${alert.type}`}>{alert.type === 'success' ? '✅ ' : '⚠️ '}{alert.msg}</div>}

      <div className="section-header">
        <h2>🚜 {t('forklifts')}</h2>
        {isAdmin && <button className="btn btn-primary" onClick={handleAddNew}>➕ {t('fkAddNew')}</button>}
      </div>

      {forklifts.length === 0 ? (
        <div className="empty-mini"><p>{t('noForklifts')}</p></div>
      ) : (
        <div className="fk-cards-grid">
          {forklifts.map(f => (
            <div key={f.id} className="fk-card" onClick={() => setSelectedForklift(f)}>
              <div className="fk-card-photo">
                {f.photoPath ? <ForkliftPhoto path={f.photoPath} /> : <div className="fk-photo-placeholder">🚜</div>}
              </div>
              <div className="fk-card-body">
                <div className="fk-card-title">
                  <strong>{f.idCode}</strong>
                  {f.brand && <span className="fk-card-brand">{f.brand}</span>}
                </div>
                {f.name && <div className="fk-card-name">{f.name}</div>}
                {f.model && <div className="fk-card-model">📐 {f.model}</div>}
                {f.capacity && <div className="fk-card-cap">⚖️ {f.capacity} {f.capacityUnit || 'kg'}</div>}
                {f.powerType && <div className="fk-card-power">⛽ {f.powerType}</div>}
                {f.serialNumber && <div className="fk-card-serial">🔢 {f.serialNumber}</div>}
              </div>
              {isAdmin && (
                <div className="fk-card-actions">
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleEdit(f); }} title={t('fkEdit')}>✏️</button>
                  <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); if (confirm(t('confirmDeleteForklift'))) onDelete(f.id); }} title={t('deleteForklift')}>🗑️</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Sub-components =====

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="exp-data-row">
      <span className="exp-data-label">{label}:</span>
      <span className="exp-data-value">{value}</span>
    </div>
  );
}

function ForkliftPhoto({ path, large }) {
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

  if (err || !url) return <div className="fk-photo-placeholder">🚜</div>;
  return (
    <img src={url} alt="Forklift" className={large ? 'fk-photo-large' : 'fk-photo-thumb'}
      onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} />
  );
}
