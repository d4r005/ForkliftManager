import { useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { checklistItems, ratingOptions } from '../data/checklistItems.js';

export default function ChecklistForm({ onSave, onCancel, editing, forklifts }) {
  const { lang, t } = useLang();

  const today = new Date();
  const [form, setForm] = useState({
    forkliftId: editing?.forkliftId || '',
    operatorName: editing?.operatorName || '',
    inspectorName: editing?.inspectorName || '',
    month: editing?.month ?? today.getMonth(),
    year: editing?.year ?? today.getFullYear(),
    day: editing?.day ?? today.getDate(),
    items: editing?.items || {},
    observations: editing?.observations || '',
  });

  const [errors, setErrors] = useState({});
  const [showSuccess, setShowSuccess] = useState(false);

  const daysInMonth = new Date(form.year, form.month + 1, 0).getDate();

  const setItem = (itemId, value) => {
    setForm(prev => ({
      ...prev,
      items: { ...prev.items, [itemId]: value }
    }));
  };

  const markAllSat = () => {
    const all = {};
    checklistItems.forEach(item => { all[item.id] = 'SAT'; });
    setForm(prev => ({ ...prev, items: all }));
  };

  const clearAll = () => {
    setForm(prev => ({ ...prev, items: {} }));
  };

  const handleSave = async () => {
    const errs = {};
    if (!form.forkliftId) errs.forkliftId = t('required');
    if (!form.operatorName) errs.operatorName = t('required');
    if (!form.inspectorName) errs.inspectorName = t('required');
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    onSave(form);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2500);
  };

  const checkedCount = Object.keys(form.items).length;
  const totalCount = checklistItems.length;

  const ratingLabel = (opt) => opt.label[lang] || opt.label.es;

  return (
    <div className="checklist-form">
      {showSuccess && (
        <div className="toast toast-success">✅ {t('saved')}</div>
      )}

      {/* Info section */}
      <div className="form-section">
        <div className="form-grid">
          <div className="form-field">
            <label>{t('forkliftId')} <span className="req">*</span></label>
            {forklifts && forklifts.length > 0 ? (
              <select
                value={form.forkliftId}
                onChange={e => setForm(p => ({ ...p, forkliftId: e.target.value }))}
                className={errors.forkliftId ? 'error' : ''}
              >
                <option value="">— {t('selectForklift')} —</option>
                {forklifts.map(f => (
                  <option key={f.id} value={f.idCode}>
                    {f.idCode} {f.name ? `(${f.name})` : ''}
                  </option>
                ))}
                <option value="__custom">{t('addNew')}...</option>
              </select>
            ) : null}
            {(forklifts && forklifts.length > 0 && form.forkliftId !== '__custom') ? null : (
              <input
                type="text"
                placeholder={t('forkliftIdPlaceholder')}
                value={form.forkliftId === '__custom' ? '' : form.forkliftId}
                onChange={e => setForm(p => ({ ...p, forkliftId: e.target.value }))}
                className={errors.forkliftId ? 'error' : ''}
              />
            )}
            {errors.forkliftId && <span className="error-msg">{errors.forkliftId}</span>}
          </div>

          <div className="form-field">
            <label>{t('operatorName')} <span className="req">*</span></label>
            <input
              type="text"
              value={form.operatorName}
              onChange={e => setForm(p => ({ ...p, operatorName: e.target.value }))}
              className={errors.operatorName ? 'error' : ''}
            />
            {errors.operatorName && <span className="error-msg">{errors.operatorName}</span>}
          </div>

          <div className="form-field">
            <label>{t('inspectorName')} <span className="req">*</span></label>
            <input
              type="text"
              value={form.inspectorName}
              onChange={e => setForm(p => ({ ...p, inspectorName: e.target.value }))}
              className={errors.inspectorName ? 'error' : ''}
            />
            {errors.inspectorName && <span className="error-msg">{errors.inspectorName}</span>}
          </div>

          <div className="form-field">
            <label>{t('date')}</label>
            <div className="date-row">
              <select value={form.day} onChange={e => setForm(p => ({ ...p, day: parseInt(e.target.value) }))}>
                {Array.from({ length: daysInMonth }, (_, i) => (
                  <option key={i} value={i + 1}>{i + 1}</option>
                ))}
              </select>
              <select value={form.month} onChange={e => setForm(p => ({ ...p, month: parseInt(e.target.value) }))}>
                {t('months').map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
              <select value={form.year} onChange={e => setForm(p => ({ ...p, year: parseInt(e.target.value) }))}>
                {Array.from({ length: 5 }, (_, i) => today.getFullYear() + i - 1).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="instructions-banner">
        <p>ℹ️ {t('instructions')}</p>
      </div>

      {/* Progress bar */}
      <div className="progress-bar-container">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${(checkedCount / totalCount) * 100}%` }}
          />
        </div>
        <span className="progress-text">{checkedCount} / {totalCount} {t('itemsChecked')}</span>
      </div>

      {/* Quick actions */}
      <div className="quick-actions">
        <button className="btn btn-sm btn-success" onClick={markAllSat}>
          ✓ {t('selectAll')}
        </button>
        <button className="btn btn-sm btn-secondary" onClick={clearAll}>
          ✕ {t('clearAll')}
        </button>
      </div>

      {/* Checklist items */}
      <div className="checklist-items">
        <div className="checklist-header-row">
          <div className="item-num">#</div>
          <div className="item-desc">{t('conceptHeader')}</div>
          <div className="item-ratings">
            {ratingOptions.map(opt => (
              <div key={opt.value} className="rating-label">{ratingLabel(opt)}</div>
            ))}
          </div>
        </div>

        {checklistItems.map((item, idx) => (
          <div key={item.id} className={`checklist-item-row ${idx % 2 === 0 ? 'even' : 'odd'}`}>
            <div className="item-num">{item.id}</div>
            <div className="item-desc">{item[lang] || item.es}</div>
            <div className="item-ratings">
              {ratingOptions.map(opt => (
                <button
                  key={opt.value}
                  className={`rating-btn rating-${opt.color} ${form.items[item.id] === opt.value ? 'selected' : ''}`}
                  onClick={() => setItem(item.id, opt.value)}
                >
                  {ratingLabel(opt)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Observations */}
      <div className="form-section">
        <div className="form-field">
          <label>{t('observations')}</label>
          <textarea
            rows={4}
            value={form.observations}
            onChange={e => setForm(p => ({ ...p, observations: e.target.value }))}
            placeholder={t('observations')}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="form-actions">
        <button className="btn btn-secondary" onClick={onCancel}>
          {t('cancel')}
        </button>
        <button className="btn btn-primary" onClick={handleSave}>
          💾 {t('saveChecklist')}
        </button>
      </div>
    </div>
  );
}
