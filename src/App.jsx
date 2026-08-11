import { useState } from 'react';
import { LanguageProvider, useLang } from './i18n/LanguageContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { useStore } from './hooks/useStore.js';
import Header from './components/Header.jsx';
import Dashboard from './components/Dashboard.jsx';
import ChecklistForm from './components/ChecklistForm.jsx';
import SavedChecklists from './components/SavedChecklists.jsx';
import ForkliftManager from './components/ForkliftManager.jsx';
import UserManager from './components/UserManager.jsx';
import EmployeeRecords from './components/EmployeeRecords.jsx';
import PdfDesigner from './components/PdfDesigner.jsx';
import Login from './components/Login.jsx';
import { exportChecklistToExcel } from './utils/exportExcel.js';
import { exportChecklistToPdf } from './utils/exportPdf.js';
import Navigation from './components/Navigation.jsx';
import { Capacitor } from '@capacitor/core';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { lang, t } = useLang();
  const store = useStore(user);
  const [view, setView] = useState('dashboard');
  const [editing, setEditing] = useState(null);

  const handleSave = async (checklist) => {
    try {
      if (editing) {
        await store.updateChecklist(editing.id, checklist);
        setEditing(null);
      } else {
        await store.addChecklist(checklist);
      }
      setView('list');
    } catch (err) {
      console.error('Save error:', err);
      alert(err.message);
    }
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
    exportChecklistToExcel(c);
  };

  const handleExportPdf = (c) => {
    // El PDF de la bitácora es mensual: si ya existen otras revisiones
    // guardadas para el mismo montacargas/mes/año, se incluyen todas en el
    // mismo documento (una columna por día) en vez de exportar solo el
    // registro que se clickeó.
    const monthGroup = store.data.checklists.filter(x =>
      x.forkliftId === c.forkliftId && x.month === c.month && x.year === c.year
    );
    exportChecklistToPdf(monthGroup.length > 0 ? monthGroup : c);
  };

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">FM</div>
        <p>{t('authLoading')}</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (store.loading && store.data.checklists.length === 0 && store.data.forklifts.length === 0) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">FM</div>
        <p>{t('authLoading')}</p>
      </div>
    );
  }

  const isAdmin = user?.role === 'admin';
  const isSupervisor = user?.role === 'supervisor';
  const canManageContent = isAdmin || isSupervisor; // acceso total salvo crear/eliminar usuarios
  const platform = Capacitor.getPlatform();
  const isAndroid = platform === 'android';

  return (
    <div className={`app ${isAndroid ? 'platform-android' : 'platform-web'}`}>
      <Header
        view={view}
        setView={(v) => { setView(v); if (v !== 'form') setEditing(null); }}
        checklistCount={store.data.checklists.length}
      />

      <Navigation
        view={view}
        setView={(v) => { setView(v); if (v !== 'form') setEditing(null); }}
        checklistCount={store.data.checklists.length}
        isAdmin={canManageContent}
      />

      <main className="app-main">
        {store.error && (
          <div className="alert alert-error" style={{ marginBottom: '16px' }}>
            ⚠️ {store.error}
          </div>
        )}
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
            onExportPdf={handleExportPdf}
            onNew={handleNew}
          />
        )}

        {view === 'forklifts' && (
          <ForkliftManager
            forklifts={store.data.forklifts}
            onAdd={store.addForklift}
            onUpdate={store.updateForklift}
            onDelete={store.deleteForklift}
          />
        )}

        {view === 'users' && canManageContent && (
          <UserManager />
        )}

        {view === 'expedientes' && (
          <EmployeeRecords />
        )}

        {view === 'designer' && isAdmin && (
          <PdfDesigner onClose={() => setView('dashboard')} />
        )}
      </main>

      <footer className="app-footer">
        <p>{t('company')} — {t('normRef')}</p>
        <p className="footer-sub">ForkliftManager v2.0 — ES · EN · 中文 · Tiếng Việt</p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LanguageProvider>
  );
}
