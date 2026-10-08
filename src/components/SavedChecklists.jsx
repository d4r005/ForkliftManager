import { useState, useMemo, useEffect } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { checklistItems, ratingOptions } from '../data/checklistItems.js';
import CorrectionModal from './CorrectionModal.jsx';

export default function SavedChecklists({ checklists, onEdit, onDelete, onExport, onExportPdf, onNew }) {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [filterMonth, setFilterMonth] = useState(-1);
  const [expandedId, setExpandedId] = useState(null);
  const [corrections, setCorrections] = useState({});
  const [correctionItem, setCorrectionItem] = useState(null);
  const [correctionsReload, setCorrectionsReload] = useState(0);

  const canManage = user?.role === 'admin' || user?.role === 'supervisor';

  // Al expandir un checklist se cargan las correcciones de sus puntos INS.
  useEffect(() => {
    if (!expandedId) { setCorrections({}); return; }
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('checklist_corrections')
          .select('item_id, corrected_by, corrected_at, correction_notes, verified_by, verified_at')
          .eq('checklist_id', expandedId);
        if (active && !error) {
          const map = {};
          (data || []).forEach(r => { map[r.item_id] = r; });
          setCorrections(map);
        }
      } catch { /* sin conexión: se muestran chips neutros */ }
    })();
    return () => { active = false; };
  }, [expandedId, correctionsReload]);

  const filtered = useMemo(() => {
    return checklists
      .filter(c => {
        const matchSearch = !search ||
          c.operatorName?.toLowerCase().includes(search.toLowerCase()) ||
          c.forkliftId?.toLowerCase().includes(search.toLowerCase());
        const matchMonth = filterMonth === -1 || c.month === filterMonth;
        return matchSearch && matchMonth;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [checklists, search, filterMonth]);

  const formatDate = (c) => {
    const months = t('months');
    return `${c.day} ${months[c.month] || ''} ${c.year}`;
  };

  const getItemText = (item) => item[lang] || item.es;
  const ratingLabel = (opt) => opt.label[lang] || opt.label.es;

  const getStatusBadge = (c) => {
    const total = checklistItems.length;
    const checked = Object.keys(c.items || {}).length;
    if (checked === total) return { class: 'status-completed', text: t('completed') };
    if (checked > 0) return { class: 'status-progress', text: t('inProgress') };
    return { class: 'status-pending', text: t('pending') };
  };

  if (checklists.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <h2>{t('noChecklists')}</h2>
        <button className="btn btn-primary" onClick={onNew}>➕ {t('newChecklist')}</button>
      </div>
    );
  }

  return (
    <div className="saved-checklists">
      <div className="list-toolbar">
        <input
          type="text"
          className="search-input"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={filterMonth}
          onChange={e => setFilterMonth(parseInt(e.target.value))}
        >
          <option value={-1}>{t('allMonths')}</option>
          {t('months').map((m, i) => (
            <option key={i} value={i}>{m}</option>
          ))}
        </select>
      </div>

      <div className="checklist-cards">
        {filtered.map(c => {
          const status = getStatusBadge(c);
          const isExpanded = expandedId === c.id;
          return (
            <div key={c.id} className="checklist-card">
              <div
                className="card-header"
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
              >
                <div className="card-info">
                  <div className="card-forklift">
                    <span className="card-icon">🚜</span>
                    <strong>{c.forkliftId}</strong>
                  </div>
                  <div className="card-operator">{c.operatorName}</div>
                  <div className="card-date">{formatDate(c)}</div>
                  <span className={`status-badge ${status.class}`}>{status.text}</span>
                </div>
                <div className="card-actions" onClick={e => e.stopPropagation()}>
                  <button className="icon-btn" onClick={() => onExport(c)} title={t('exportExcel')}>
                    📊
                  </button>
                  <button className="icon-btn" onClick={() => onExportPdf(c)} title="Exportar PDF">
                    📄
                  </button>
                  <button className="icon-btn" onClick={() => onEdit(c)} title={t('editChecklist')}>
                    ✏️
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => { if (confirm(t('confirmDelete'))) onDelete(c.id); }}
                    title={t('deleteChecklist')}
                  >
                    🗑️
                  </button>
                  <button className="icon-btn expand" title={isExpanded ? '−' : '+'}>
                    {isExpanded ? '▾' : '▸'}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="card-expanded">
                  <div className="expanded-info">
                    <p><strong>{t('inspectorName')}:</strong> {c.inspectorName}</p>
                    <p><strong>{t('observations')}:</strong> {c.observations || '—'}</p>
                  </div>
                  <div className="expanded-items">
                    {checklistItems.map(item => {
                      const rating = c.items?.[item.id];
                      const opt = ratingOptions.find(o => o.value === rating);
                      const corr = corrections[item.id];
                      return (
                        <div key={item.id} className="expanded-item">
                          <span className="ei-num">{item.id}</span>
                          <span className="ei-desc">{getItemText(item)}</span>
                          <span className={`ei-rating ${rating ? `rating-${opt?.color}` : 'pending'}`}>
                            {opt ? ratingLabel(opt) : t('pending')}
                          </span>
                          {rating === 'INS' && (
                            <span className="ei-correction">
                              {corr && corr.verified_by ? (
                                <span className="correction-chip verified">✅ {t('correctionVerified')}</span>
                              ) : corr ? (
                                <span className="correction-chip corrected">🔧 {t('correctionDone')}</span>
                              ) : (
                                <span className="correction-chip pending">⚠️ {t('correctionPending')}</span>
                              )}
                              <button
                                className="icon-btn correction-btn"
                                title={t('correctionManage')}
                                onClick={() => setCorrectionItem({ checklistId: c.id, item })}
                              >🔧</button>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <p>{t('noChecklists')}</p>
        </div>
      )}

      {correctionItem && (
        <CorrectionModal
          checklistId={correctionItem.checklistId}
          item={correctionItem.item}
          canManage={canManage}
          onClose={() => setCorrectionItem(null)}
          onSaved={() => setCorrectionsReload(n => n + 1)}
        />
      )}
    </div>
  );
}
