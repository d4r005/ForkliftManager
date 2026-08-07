import { useMemo } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { checklistItems } from '../data/checklistItems.js';

export default function Dashboard({ checklists, onNew, onViewList }) {
  const { lang, t } = useLang();

  const stats = useMemo(() => {
    const total = checklists.length;
    let totalItems = 0;
    let satCount = 0;
    let insCount = 0;
    let naCount = 0;

    checklists.forEach(c => {
      Object.values(c.items || {}).forEach(rating => {
        totalItems++;
        if (rating === 'SAT') satCount++;
        else if (rating === 'INS') insCount++;
        else if (rating === 'N/A') naCount++;
      });
    });

    const completed = checklists.filter(c => Object.keys(c.items || {}).length === checklistItems.length).length;
    const passRate = totalItems > 0 ? Math.round((satCount / totalItems) * 100) : 0;

    return { total, totalItems, satCount, insCount, naCount, completed, passRate };
  }, [checklists]);

  const recent = useMemo(() => {
    return [...checklists]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
  }, [checklists]);

  const months = t('months');
  const formatDate = (c) => `${c.day} ${months[c.month] || ''} ${c.year}`;

  return (
    <div className="dashboard">
      {/* Stats cards */}
      <div className="stats-grid">
        <div className="stat-card stat-primary">
          <div className="stat-icon">📋</div>
          <div className="stat-body">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">{t('totalChecklists')}</div>
          </div>
        </div>

        <div className="stat-card stat-success">
          <div className="stat-icon">✅</div>
          <div className="stat-body">
            <div className="stat-value">{stats.completed}</div>
            <div className="stat-label">{t('completed')}</div>
          </div>
        </div>

        <div className="stat-card stat-info">
          <div className="stat-icon">📊</div>
          <div className="stat-body">
            <div className="stat-value">{stats.passRate}%</div>
            <div className="stat-label">{t('passRate')}</div>
          </div>
        </div>

        <div className="stat-card stat-warning">
          <div className="stat-icon">⚠️</div>
          <div className="stat-body">
            <div className="stat-value">{stats.insCount}</div>
            <div className="stat-label">{t('needsAttention')}</div>
          </div>
        </div>
      </div>

      {/* Items summary */}
      <div className="dashboard-section">
        <h3>{t('itemsSummary')}</h3>
        <div className="items-summary-bar">
          <div className="bar-segment sat" style={{ width: `${stats.totalItems > 0 ? (stats.satCount / stats.totalItems) * 100 : 0}%` }}>
            {stats.satCount > 0 && `${t('satisfactory')}: ${stats.satCount}`}
          </div>
          <div className="bar-segment ins" style={{ width: `${stats.totalItems > 0 ? (stats.insCount / stats.totalItems) * 100 : 0}%` }}>
            {stats.insCount > 0 && `${t('unsatisfactory')}: ${stats.insCount}`}
          </div>
          <div className="bar-segment na" style={{ width: `${stats.totalItems > 0 ? (stats.naCount / stats.totalItems) * 100 : 0}%` }}>
            {stats.naCount > 0 && `${t('notApplicable')}: ${stats.naCount}`}
          </div>
        </div>
      </div>

      {/* Recent checklists */}
      <div className="dashboard-section">
        <div className="section-header">
          <h3>{t('recentChecklists')}</h3>
          {checklists.length > 5 && (
            <button className="btn btn-sm btn-link" onClick={onViewList}>{t('savedChecklists')} →</button>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="empty-mini">
            <p>{t('noChecklists')}</p>
            <button className="btn btn-primary" onClick={onNew}>➕ {t('newChecklist')}</button>
          </div>
        ) : (
          <div className="recent-list">
            {recent.map(c => (
              <div key={c.id} className="recent-item" onClick={() => onViewList()}>
                <div className="recent-forklift">🚜 {c.forkliftId}</div>
                <div className="recent-operator">{c.operatorName}</div>
                <div className="recent-date">{formatDate(c)}</div>
                <div className="recent-status">
                  {Object.keys(c.items || {}).length}/{checklistItems.length}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick action */}
      <div className="dashboard-cta">
        <button className="btn btn-primary btn-lg" onClick={onNew}>
          ➕ {t('newChecklist')}
        </button>
      </div>
    </div>
  );
}
