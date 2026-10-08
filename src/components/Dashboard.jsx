import { useMemo, useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { checklistItems } from '../data/checklistItems.js';

// Semáforo de mantenimiento (misma lógica que ForkliftManager)
function maintState(f) {
  const cur = Number(f.currentHours) || 0;
  const last = Number(f.hoursLastService) || 0;
  const interval = Number(f.serviceIntervalHours) || 200;
  if (!f.currentHours && !f.hoursLastService) return { state: 'none', hoursSince: 0, interval };
  const hoursSince = Math.max(cur - last, 0);
  if (hoursSince >= interval) return { state: 'due', hoursSince, interval };
  if (hoursSince >= interval * 0.9) return { state: 'soon', hoursSince, interval };
  return { state: 'ok', hoursSince, interval };
}

// Calcula métricas de un conjunto de revisiones
function computeStats(list) {
  let totalItems = 0, sat = 0, ins = 0, na = 0, withFailures = 0;
  const failByItem = {};
  const failByForklift = {};
  list.forEach(c => {
    let failed = 0;
    Object.entries(c.items || {}).forEach(([key, rating]) => {
      totalItems++;
      if (rating === 'SAT') sat++;
      else if (rating === 'N/A') na++;
      else if (rating === 'INS') {
        ins++; failed++;
        failByItem[key] = (failByItem[key] || 0) + 1;
      }
    });
    if (failed > 0) {
      withFailures++;
      failByForklift[c.forkliftId] = (failByForklift[c.forkliftId] || 0) + failed;
    }
  });
  const evaluated = sat + ins; // N/A no cuenta para la tasa de aprobación
  const passRate = evaluated > 0 ? Math.round((sat / evaluated) * 100) : null;
  return { total: list.length, totalItems, sat, ins, na, withFailures, passRate, failByItem, failByForklift };
}

function Delta({ value, goodWhenUp = true, suffix = '' }) {
  if (value === null || value === undefined || value === 0) {
    return <span className="kpi-delta kpi-delta-flat">— {value === 0 ? '0' : ''}{suffix}</span>;
  }
  const up = value > 0;
  const good = up === goodWhenUp;
  return (
    <span className={`kpi-delta ${good ? 'kpi-delta-good' : 'kpi-delta-bad'}`}>
      {up ? '▲' : '▼'} {Math.abs(value)}{suffix}
    </span>
  );
}

export default function Dashboard({ checklists, forklifts = [], isManager = false, onNew, onViewList }) {
  const { lang, t } = useLang();
  const [period, setPeriod] = useState('month'); // today | week | month | all

  const now = new Date();
  const todayStr = now.toDateString();

  // Fecha efectiva de una revisión: la del formulario (día/mes/año); si falta, createdAt
  const dateOf = (c) => {
    if (c.year && c.month !== undefined && c.month !== null && c.day) {
      return new Date(Number(c.year), Number(c.month), Number(c.day));
    }
    return new Date(c.createdAt);
  };

  const ranges = useMemo(() => {
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = startOfDay(new Date());
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - 6);
    const prevWeekStart = new Date(today); prevWeekStart.setDate(today.getDate() - 13);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { today, weekStart, prevWeekStart, monthStart, prevMonthStart };
  }, []);

  const { current, previous } = useMemo(() => {
    const { today, weekStart, prevWeekStart, monthStart, prevMonthStart } = ranges;
    const inRange = (c, from, to) => { const d = dateOf(c); return d >= from && d < to; };
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

    let cur, prev;
    if (period === 'today') {
      cur = checklists.filter(c => inRange(c, today, tomorrow));
      prev = checklists.filter(c => inRange(c, yesterday, today));
    } else if (period === 'week') {
      cur = checklists.filter(c => inRange(c, weekStart, tomorrow));
      prev = checklists.filter(c => inRange(c, prevWeekStart, weekStart));
    } else if (period === 'month') {
      cur = checklists.filter(c => inRange(c, monthStart, monthEnd));
      prev = checklists.filter(c => inRange(c, prevMonthStart, monthStart));
    } else {
      cur = checklists; prev = null;
    }
    return { current: cur, previous: prev };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklists, period, ranges]);

  const stats = useMemo(() => computeStats(current), [current]);
  const prevStats = useMemo(() => (previous ? computeStats(previous) : null), [previous]);

  // Cobertura de hoy: equipos de la flota con revisión hoy vs. pendientes
  const coverage = useMemo(() => {
    const checkedToday = new Set(
      checklists.filter(c => dateOf(c).toDateString() === todayStr).map(c => c.forkliftId)
    );
    const fleet = forklifts.map(f => f.idCode);
    const checked = fleet.filter(id => checkedToday.has(id));
    const pending = fleet.filter(id => !checkedToday.has(id));
    return { fleetSize: fleet.length, checked: checked.length, pending };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklists, forklifts, todayStr]);

  // Mantenimiento por horómetro
  const maintenance = useMemo(() => {
    const due = [], soon = [];
    forklifts.forEach(f => {
      const m = maintState(f);
      if (m.state === 'due') due.push({ f, m });
      else if (m.state === 'soon') soon.push({ f, m });
    });
    due.sort((a, b) => (b.m.hoursSince - b.m.interval) - (a.m.hoursSince - a.m.interval));
    return { due, soon };
  }, [forklifts]);

  // Ranking de equipos con más fallas
  const topForklifts = useMemo(() => {
    return Object.entries(stats.failByForklift)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [stats]);

  // Ítems que más fallan
  const topItems = useMemo(() => {
    return Object.entries(stats.failByItem)
      .map(([key, count]) => {
        const item = checklistItems.find(i => String(i.id) === String(key) || i.key === key);
        return { key, count, label: item ? (item[lang] || item.es) : key };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [stats, lang]);

  const recent = useMemo(() => {
    return [...checklists]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
  }, [checklists]);

  const months = t('months');
  const formatDate = (c) => `${c.day} ${months[c.month] || ''} ${c.year}`;
  const pct = (n, total) => (total > 0 ? (n / total) * 100 : 0);
  const passDelta = prevStats && stats.passRate !== null && prevStats.passRate !== null
    ? stats.passRate - prevStats.passRate : null;
  const totalDelta = prevStats ? stats.total - prevStats.total : null;
  const failDelta = prevStats ? stats.withFailures - prevStats.withFailures : null;
  const coveragePct = coverage.fleetSize > 0 ? Math.round((coverage.checked / coverage.fleetSize) * 100) : 0;
  const maxFailForklift = topForklifts[0]?.count || 1;
  const maxFailItem = topItems[0]?.count || 1;

  const periodLabels = {
    today: t('kpiToday'), week: t('kpiWeek'), month: t('kpiMonth'), all: t('kpiAll'),
  };

  // ============ VISTA SIMPLE (operadores) ============
  if (!isManager) {
    const simple = computeStats(checklists);
    const completed = checklists.filter(c => Object.keys(c.items || {}).length === checklistItems.length).length;
    return (
      <div className="dashboard">
        <div className="stats-grid">
          <div className="stat-card stat-primary">
            <div className="stat-icon">📋</div>
            <div className="stat-body">
              <div className="stat-value">{simple.total}</div>
              <div className="stat-label">{t('totalChecklists')}</div>
            </div>
          </div>
          <div className="stat-card stat-success">
            <div className="stat-icon">✅</div>
            <div className="stat-body">
              <div className="stat-value">{completed}</div>
              <div className="stat-label">{t('completed')}</div>
            </div>
          </div>
          <div className="stat-card stat-info">
            <div className="stat-icon">📊</div>
            <div className="stat-body">
              <div className="stat-value">{simple.passRate ?? 0}%</div>
              <div className="stat-label">{t('passRate')}</div>
            </div>
          </div>
          <div className="stat-card stat-warning">
            <div className="stat-icon">⚠️</div>
            <div className="stat-body">
              <div className="stat-value">{simple.withFailures}</div>
              <div className="stat-label">{t('kpiWithFailures')}</div>
            </div>
          </div>
        </div>

        <RecentSection t={t} recent={recent} checklists={checklists} formatDate={formatDate} onNew={onNew} onViewList={onViewList} />

        <div className="dashboard-cta">
          <button className="btn btn-primary btn-lg" onClick={onNew}>➕ {t('newChecklist')}</button>
        </div>
      </div>
    );
  }

  // ============ VISTA ADMIN / SUPERVISOR ============
  const attentionCount = coverage.pending.length + maintenance.due.length + stats.withFailures;

  return (
    <div className="dashboard">
      {/* Selector de periodo */}
      <div className="kpi-toolbar">
        <div className="kpi-periods">
          {['today', 'week', 'month', 'all'].map(p => (
            <button
              key={p}
              className={`kpi-period-btn ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
        {prevStats && <span className="kpi-compare-note">{t('kpiVsPrevious')}</span>}
      </div>

      {/* KPIs principales */}
      <div className="stats-grid">
        <div className="stat-card stat-primary">
          <div className="stat-icon">📋</div>
          <div className="stat-body">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">{t('totalChecklists')}</div>
            {totalDelta !== null && <Delta value={totalDelta} goodWhenUp />}
          </div>
        </div>

        <div className="stat-card stat-info">
          <div className="stat-icon">📊</div>
          <div className="stat-body">
            <div className="stat-value">{stats.passRate === null ? '—' : `${stats.passRate}%`}</div>
            <div className="stat-label">{t('passRate')}</div>
            {passDelta !== null && <Delta value={passDelta} goodWhenUp suffix=" pts" />}
          </div>
        </div>

        <div className={`stat-card ${stats.withFailures > 0 ? 'stat-danger' : 'stat-success'}`}>
          <div className="stat-icon">{stats.withFailures > 0 ? '🚨' : '✅'}</div>
          <div className="stat-body">
            <div className="stat-value">{stats.withFailures}</div>
            <div className="stat-label">{t('kpiWithFailures')}</div>
            {failDelta !== null && <Delta value={failDelta} goodWhenUp={false} />}
          </div>
        </div>

        <div className={`stat-card ${coverage.pending.length > 0 ? 'stat-warning' : 'stat-success'}`}>
          <div className="stat-icon">🚜</div>
          <div className="stat-body">
            <div className="stat-value">{coverage.checked}/{coverage.fleetSize}</div>
            <div className="stat-label">{t('kpiCheckedToday')}</div>
            <span className="kpi-sub">{coveragePct}%</span>
          </div>
        </div>
      </div>

      {/* Alertas accionables */}
      {(coverage.pending.length > 0 || maintenance.due.length > 0 || maintenance.soon.length > 0) && (
        <div className="dashboard-section">
          <h3>🔔 {t('kpiAlerts')} <span className="kpi-badge">{attentionCount}</span></h3>
          <div className="kpi-alerts">
            {coverage.pending.length > 0 && (
              <div className="kpi-alert kpi-alert-warning">
                <div className="kpi-alert-title">
                  ⏳ {t('kpiPendingToday')} ({coverage.pending.length})
                </div>
                <div className="kpi-chips">
                  {coverage.pending.slice(0, 12).map(id => <span key={id} className="kpi-chip">{id}</span>)}
                  {coverage.pending.length > 12 && <span className="kpi-chip kpi-chip-more">+{coverage.pending.length - 12}</span>}
                </div>
              </div>
            )}
            {maintenance.due.length > 0 && (
              <div className="kpi-alert kpi-alert-danger">
                <div className="kpi-alert-title">
                  🔧 {t('kpiMaintDue')} ({maintenance.due.length})
                </div>
                <div className="kpi-chips">
                  {maintenance.due.slice(0, 8).map(({ f, m }) => (
                    <span key={f.id} className="kpi-chip kpi-chip-danger">
                      {f.idCode} · +{Math.round(m.hoursSince - m.interval)} h
                    </span>
                  ))}
                </div>
              </div>
            )}
            {maintenance.soon.length > 0 && (
              <div className="kpi-alert kpi-alert-warning">
                <div className="kpi-alert-title">
                  🛠️ {t('kpiMaintSoon')} ({maintenance.soon.length})
                </div>
                <div className="kpi-chips">
                  {maintenance.soon.slice(0, 8).map(({ f, m }) => (
                    <span key={f.id} className="kpi-chip">
                      {f.idCode} · {Math.max(Math.round(m.interval - m.hoursSince), 0)} h
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resumen de items con leyenda */}
      <div className="dashboard-section">
        <h3>{t('itemsSummary')}</h3>
        {stats.totalItems === 0 ? (
          <p className="kpi-empty">{t('kpiNoData')}</p>
        ) : (
          <>
            <div className="items-summary-bar">
              <div className="bar-segment sat" style={{ width: `${pct(stats.sat, stats.totalItems)}%` }} title={`${t('satisfactory')}: ${stats.sat}`} />
              <div className="bar-segment ins" style={{ width: `${pct(stats.ins, stats.totalItems)}%` }} title={`${t('unsatisfactory')}: ${stats.ins}`} />
              <div className="bar-segment na" style={{ width: `${pct(stats.na, stats.totalItems)}%` }} title={`${t('notApplicable')}: ${stats.na}`} />
            </div>
            <div className="kpi-legend">
              <span><i className="dot sat" /> {t('satisfactory')}: <b>{stats.sat}</b> ({Math.round(pct(stats.sat, stats.totalItems))}%)</span>
              <span><i className="dot ins" /> {t('unsatisfactory')}: <b>{stats.ins}</b> ({Math.round(pct(stats.ins, stats.totalItems))}%)</span>
              <span><i className="dot na" /> {t('notApplicable')}: <b>{stats.na}</b> ({Math.round(pct(stats.na, stats.totalItems))}%)</span>
            </div>
          </>
        )}
      </div>

      {/* Rankings */}
      <div className="kpi-two-col">
        <div className="dashboard-section">
          <h3>🚜 {t('kpiTopForklifts')}</h3>
          {topForklifts.length === 0 ? (
            <p className="kpi-empty">🎉 {t('kpiNoFailures')}</p>
          ) : (
            <div className="kpi-rank">
              {topForklifts.map(({ id, count }) => (
                <div key={id} className="kpi-rank-row">
                  <span className="kpi-rank-label">{id}</span>
                  <div className="kpi-rank-track">
                    <div className="kpi-rank-fill" style={{ width: `${(count / maxFailForklift) * 100}%` }} />
                  </div>
                  <span className="kpi-rank-value">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <h3>⚠️ {t('kpiTopItems')}</h3>
          {topItems.length === 0 ? (
            <p className="kpi-empty">🎉 {t('kpiNoFailures')}</p>
          ) : (
            <div className="kpi-rank">
              {topItems.map(({ key, count, label }) => (
                <div key={key} className="kpi-rank-row kpi-rank-row-item">
                  <span className="kpi-rank-label" title={label}>{label}</span>
                  <div className="kpi-rank-track">
                    <div className="kpi-rank-fill" style={{ width: `${(count / maxFailItem) * 100}%` }} />
                  </div>
                  <span className="kpi-rank-value">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <RecentSection t={t} recent={recent} checklists={checklists} formatDate={formatDate} onNew={onNew} onViewList={onViewList} />

      <div className="dashboard-cta">
        <button className="btn btn-primary btn-lg" onClick={onNew}>➕ {t('newChecklist')}</button>
      </div>
    </div>
  );
}

function RecentSection({ t, recent, checklists, formatDate, onNew, onViewList }) {
  return (
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
          {recent.map(c => {
            const fails = Object.values(c.items || {}).filter(r => r === 'INS').length;
            return (
              <div key={c.id} className="recent-item" onClick={() => onViewList()}>
                <div className="recent-forklift">🚜 {c.forkliftId}</div>
                <div className="recent-operator">{c.operatorName}</div>
                <div className="recent-date">{formatDate(c)}</div>
                <div className="recent-status">
                  {fails > 0
                    ? <span className="kpi-fail-pill">⚠️ {fails}</span>
                    : <span className="kpi-ok-pill">✓</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
