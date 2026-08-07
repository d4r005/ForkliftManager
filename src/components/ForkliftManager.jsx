import { useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';

export default function ForkliftManager({ forklifts, onAdd, onDelete }) {
  const { lang, t } = useLang();
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');

  const handleAdd = async () => {
    if (!newId.trim()) return;
    try {
      await onAdd({ id: newId.trim(), name: newName.trim() });
      setNewId('');
      setNewName('');
    } catch (err) {
      console.error('Add forklift error:', err);
    }
  };

  return (
    <div className="forklift-manager">
      <div className="forklift-add">
        <h3>➕ {t('addForklift')}</h3>
        <div className="forklift-form">
          <input
            type="text"
            placeholder={t('forkliftIdPlaceholder')}
            value={newId}
            onChange={e => setNewId(e.target.value)}
            className="forklift-input"
          />
          <input
            type="text"
            placeholder={t('forkliftName')}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="forklift-input"
          />
          <button className="btn btn-primary" onClick={handleAdd} disabled={!newId.trim()}>
            {t('saveForklift')}
          </button>
        </div>
      </div>

      <div className="forklift-list">
        <h3>🚜 {t('forklifts')}</h3>
        {forklifts.length === 0 ? (
          <div className="empty-mini">
            <p>{t('noForklifts')}</p>
          </div>
        ) : (
          <div className="forklift-cards">
            {forklifts.map(f => (
              <div key={f.id} className="forklift-card">
                <div className="forklift-card-info">
                  <div className="forklift-card-id">🚜 {f.idCode}</div>
                  {f.name && <div className="forklift-card-name">{f.name}</div>}
                </div>
                <button
                  className="icon-btn danger"
                  onClick={() => { if (confirm(t('confirmDeleteForklift'))) onDelete(f.id); }}
                  title={t('deleteForklift')}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
