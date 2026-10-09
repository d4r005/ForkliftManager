import { useState, useEffect, useCallback } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

// Bitácora de auditoría (solo admin): historial de INSERT/UPDATE/DELETE
// en checklists, forklifts y app_users, alimentada por los triggers de
// supabase/audit_log_migration.sql.
export default function AuditLog() {
  const { t } = useLang();
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterTable, setFilterTable] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [userNames, setUserNames] = useState({});

  // changed_by guarda el número de empleado (o 'sistema'); lo resolvemos
  // a nombre para que la bitácora se lea bien.
  useEffect(() => {
    if (!user?.employeeNumber) return;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_users', { p_admin_employee_number: user.employeeNumber });
        const map = {};
        (data?.users || []).forEach(u => { map[String(u.employeeNumber)] = u.name; });
        setUserNames(map);
      } catch (e) { /* map vacío: se muestran los números tal cual */ }
    })();
  }, [user?.employeeNumber]);

  const actorLabel = (v) => {
    if (!v) return '—';
    const name = userNames[String(v)];
    return name ? `${name} (${v})` : v;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(200);
      if (filterTable !== 'all') query = query.eq('table_name', filterTable);
      if (filterAction !== 'all') query = query.eq('action', filterAction);
      const { data, error: dbError } = await query;
      if (dbError) throw dbError;
      setEntries(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterTable, filterAction]);

  useEffect(() => { load(); }, [load]);

  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const tableLabel = { checklists: 'Revisiones', forklifts: 'Montacargas', app_users: 'Usuarios' };
  const actionClass = { INSERT: 'audit-insert', UPDATE: 'audit-update', DELETE: 'audit-delete' };
  const actionIcon = { INSERT: '✚', UPDATE: '✏️', DELETE: '🗑️' };

  return (
    <div className="audit-log">
      <div className="section-header">
        <h2>🗂️ {t('auditTitle')}</h2>
        <button className="btn btn-secondary" onClick={load}>🔄 {t('refresh')}</button>
      </div>

      <div className="list-toolbar">
        <select className="filter-select" value={filterTable} onChange={e => setFilterTable(e.target.value)}>
          <option value="all">{t('auditAllTables')}</option>
          <option value="checklists">{t('auditTableChecklists')}</option>
          <option value="forklifts">{t('auditTableForklifts')}</option>
          <option value="app_users">{t('auditTableUsers')}</option>
        </select>
        <select className="filter-select" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
          <option value="all">{t('auditAllActions')}</option>
          <option value="INSERT">{t('auditInsert')}</option>
          <option value="UPDATE">{t('auditUpdate')}</option>
          <option value="DELETE">{t('auditDelete')}</option>
        </select>
      </div>

      {error && (
        <div className="alert alert-error">
          ⚠️ {error}
          {/relation .* does not exist|42P01/i.test(error) && (
            <p style={{ marginTop: '6px' }}>{t('auditNeedsMigration')}</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="empty-mini"><p>…</p></div>
      ) : entries.length === 0 && !error ? (
        <div className="empty-mini"><p>{t('auditEmpty')}</p></div>
      ) : (
        <div className="audit-list">
          {entries.map(e => (
            <div key={e.id} className="audit-entry" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
              <div className="audit-entry-row">
                <span className={`audit-action ${actionClass[e.action] || ''}`}>
                  {actionIcon[e.action] || '•'} {e.action}
                </span>
                <span className="audit-table">{tableLabel[e.table_name] || e.table_name}</span>
                <span className="audit-record" title={e.record_id}>
                  #{e.record_id ? String(e.record_id).slice(0, 8) : '—'}
                </span>
                <span className="audit-user">{actorLabel(e.changed_by)}</span>
                <span className="audit-date">{fmtDateTime(e.changed_at)}</span>
              </div>
              {expandedId === e.id && e.details && (
                <pre className="audit-details">{JSON.stringify(e.details, null, 2)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
