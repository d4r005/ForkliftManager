import { useState } from 'react';
import { LanguageProvider, useLang } from './i18n/LanguageContext.jsx';
import { useStore } from './hooks/useStore.js';
import Header from './components/Header.jsx';
import Dashboard from './components/Dashboard.jsx';
import ChecklistForm from './components/ChecklistForm.jsx';
import SavedChecklists from './components/SavedChecklists.jsx';
import ForkliftManager from './components/ForkliftManager.jsx';
import { exportChecklistToExcel } from './utils/exportExcel.js';

function AppContent() {
  const { lang, t } = useLang();
  const store = useStore();
  const [view, setView] = useState('dashboard');
  const [editing, setEditing] = useState(null);

  const handleSave = (checklist) => {
    if (editing) {
      store.updateChecklist(editing.id, checklist);
      setEditing(null);
    } else {
      store.addChecklist(checklist);
    }
    setView('list');
  };

  const handleEdit = (c) => {
    setEditing(c);
    setView('form');
  };

  const handleNew = () => {
    setEditing(null);
    setView('form');
  };

  const handleExport = (c) => {
    exportChecklistToExcel(c, lang);
  };

  return (
    <div className="app">
      <Header
        view={view}
        setView={(v) => { setView(v); if (v !== 'form') setEditing(null); }}
        checklistCount={store.data.checklists.length}
      />

      <main className="app-main">
        {view === 'dashboard' && (
          <Dashboard
            checklists={store.data.checklists}
            onNew={handleNew}
            onViewList={() => setView('list')}
          />
        )}

        {view === 'form' && (
          <ChecklistForm
            onSave={handleSave}
            onCancel={() => { setEditing(null); setView('list'); }}
            editing={editing}
            forklifts={store.data.forklifts}
          />
        )}

        {view === 'list' && (
          <SavedChecklists
            checklists={store.data.checklists}
            onEdit={handleEdit}
            onDelete={store.deleteChecklist}
            onExport={handleExport}
            onNew={handleNew}
          />
        )}

        {view === 'forklifts' && (
          <ForkliftManager
            forklifts={store.data.forklifts}
            onAdd={store.addForklift}
            onDelete={store.deleteForklift}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>{t('company')} — {t('normRef')}</p>
        <p className="footer-sub">MontaControl v1.0 — ES · EN · 中文 · Tiếng Việt</p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}
