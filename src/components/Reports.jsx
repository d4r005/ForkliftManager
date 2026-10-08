import { useMemo } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { checklistItems } from '../data/checklistItems.js';

// Reportes y tendencias (admin/supervisor): KPIs, insatisfactorios por
// montacargas, puntos críticos y tendencia mensual. Gráficas sin
// dependencias externas (barras CSS/SVG puras).
export default function Reports({ checklists = [], forklifts = [] }) {
  const { t, lang } = useLang();

  const stats = useMemo(() => {
    const total = checklists.length;
    let insCount = 0;
    let satCount = 0;
    let naCount = 0;
    const insByForklift = {};
    const insByItem = {};
    const byMonth = {};

    checklists.forEach(c => {
      const mk = `${c.year}-${String((c.month ?? 0) + 1).padStart(2, '0')}`;
      byMonth[mk] = byMonth[mk] || { checklists: 0, ins: 0 };
      byMonth[mk].checklists++;
      Object.entries(c.items || {}).forEach(([itemId, rating]) => {
        if (rating === 'INS') {
          insCount++;
          insByForklift[c.forkliftId] = (insByForklift[c.forkliftId] || 0) + 1;
          insByItem[itemId] = (insByItem[itemId] || 0) + 1;
          byMonth[mk].ins++;
        } else if (rating === 'SAT') {
          satCount++;
        } else if (rating === 'N/A') {
          naCount++;
        }
      });
    });

    const rated = satCount + insCount;
    const topForklifts = Object.entries(insByForklift)
      .map(([id, ins]) => ({ id, ins }))
      .sort((a, b) => b.ins - a.ins)
      .slice(0, 10);
    const topItems = Object.entries(insByItem)
      .map(([id, ins]) => ({ item: checklistItems.find(i => String(i.id) === String(id)), ins }))
      .filter(x => x.item)
      .sort((a, b) => b.ins - a.ins)
      .slice(0, 10);
    const months = Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6);

    return { total, insCount, satCount, naCount, rated, topForklifts, topItems, months };
  }, [checklists]);

  if (checklists.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📈</div>
        <h2>{t('reportsEmpty')}</h2>
      </div>
    );
  }

  const satisfaction = stats.rated > 0 ? Math.round((stats.satCount / stats.rated) * 100) : 100;
  const maxFk = stats.topForklifts[0]?.ins || 1;
  const maxItem = stats.topItems[0]?.ins || 1;
  const maxMonth = Math.max(1, ...stats.months.map(([, m]) => Math.max(m.checklists, m.ins)));

  return (
    <div className="reports-view">
      <div className="section-header">
        <h2>📈 {t('reportsTitle')}</h2>
      </div>

      {/* KPIs */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">{t('reportsTotal')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: satisfaction >= 90 ? '#22c55e' : satisfaction >= 70 ? '#eab308' : '#ef4444' }}>
            {satisfaction}%
          </div>
          <div className="stat-label">{t('reportsSatisfaction')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#ef4444' }}>{stats.insCount}</div>
          <div className="stat-label">{t('reportsIns')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.topForklifts[0]?.id || '—'}</div>
          <div className="stat-label">{t('reportsWorstForklift')}</div>
        </div>
      </div>

      <div className="reports-grid">
        {/* INS por montacargas */}
        <div className="dashboard-section reports-section">
          <h3>🚜 {t('reportsInsByForklift')}</h3>
          {stats.topForklifts.length === 0 ? (
            <p className="reports-no-data">{t('reportsNoIns')}</p>
          ) : (
            <div className="reports-bars">
              {stats.topForklifts.map(f => (
                <div key={f.id} className="reports-bar-row">
                  <span className="reports-bar-label">{f.id}</span>
                  <div className="reports-bar-track">
                    <div className="reports-bar-fill danger" style={{ width: `${(f.ins / maxFk) * 100}%` }} />
                  </div>
                  <span className="reports-bar-value">{f.ins}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Puntos críticos */}
        <div className="dashboard-section reports-section">
          <h3>⚠️ {t('reportsInsByItem')}</h3>
          {stats.topItems.length === 0 ? (
            <p className="reports-no-data">{t('reportsNoIns')}</p>
          ) : (
            <div className="reports-bars">
              {stats.topItems.map(({ item, ins }) => (
                <div key={item.id} className="reports-bar-row">
                  <span className="reports-bar-label reports-bar-label-wide" title={item[lang] || item.es}>
                    {item.id}. {(item[lang] || item.es).slice(0, 34)}
                  </span>
                  <div className="reports-bar-track">
                    <div className="reports-bar-fill warning" style={{ width: `${(ins / maxItem) * 100}%` }} />
                  </div>
                  <span className="reports-bar-value">{ins}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tendencia mensual */}
      <div className="dashboard-section reports-section">
        <h3>📅 {t('reportsTrend')}</h3>
        <svg className="reports-trend-svg" viewBox={`0 0 ${Math.max(stats.months.length * 70, 280)} 160`}>
          {stats.months.map(([mk], i) => (
            <text key={mk} x={35 + i * 70} y="150" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.6">
              {mk.slice(2)}
            </text>
          ))}
          {/* Eje */}
          <line x1="20" y1="10" x2="20" y2="135" stroke="currentColor" strokeOpacity="0.2" />
          <line x1="20" y1="135" x2={20 + stats.months.length * 70} y2="135" stroke="currentColor" strokeOpacity="0.2" />
          {/* Línea de revisiones */}
          <polyline
            fill="none" stroke="#1E3A8A" strokeWidth="2.5" strokeLinejoin="round"
            points={stats.months.map(([, m], i) => {
              const x = 35 + i * 70;
              const y = 135 - (m.checklists / maxMonth) * 120;
              return `${x},${y}`;
            }).join(' ')}
          />
          {stats.months.map(([, m], i) => (
            <circle key={`c${i}`} cx={35 + i * 70} cy={135 - (m.checklists / maxMonth) * 120} r="4" fill="#1E3A8A" />
          ))}
          {/* Barras de INS */}
          {stats.months.map(([, m], i) => {
            const h = (m.ins / maxMonth) * 120;
            return (
              <rect key={`b${i}`} x={27 + i * 70} y={135 - h} width="16" height={h} rx="3" fill="#ef4444" opacity="0.75" />
            );
          })}
        </svg>
        <div className="reports-legend">
          <span>🟦 {t('reportsChecklists')}</span>
          <span>🟥 {t('reportsIns')}</span>
        </div>
      </div>
    </div>
  );
}
