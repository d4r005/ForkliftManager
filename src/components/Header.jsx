import { useLang } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { languages } from '../data/checklistItems.js';

export default function Header({ view, setView, checklistCount }) {
  const { lang, setLang, t } = useLang();
  const { user, signOut } = useAuth();

  const handleSignOut = () => {
    if (confirm(t('authSignOutConfirm'))) signOut();
  };

  const isAdmin = user?.role === 'admin';

  return (
    <header className="app-header">
      <div className="header-top">
        <div className="header-brand" onClick={() => setView('dashboard')}>
          <div className="brand-logo">M</div>
          <div className="brand-text">
            <h1>MontaControl</h1>
            <p>{t('appSubtitle')}</p>
          </div>
        </div>

        <div className="header-controls">
          <div className="lang-selector">
            {languages.map(l => (
              <button
                key={l.code}
                className={`lang-btn ${lang === l.code ? 'active' : ''}`}
                onClick={() => setLang(l.code)}
                title={l.name}
              >
                <span className="lang-flag">{l.flag}</span>
                <span className="lang-code">{l.code.toUpperCase()}</span>
              </button>
            ))}
          </div>

          {/* User info */}
          <div className="user-menu">
            <div className="user-avatar" title={user?.name}>
              {isAdmin ? '🛡️' : '👤'}
            </div>
            <div className="user-info-text">
              <span className="user-name">{user?.name || user?.employeeNumber}</span>
              <span className="user-emp">#{user?.employeeNumber}</span>
            </div>
            <button className="icon-btn" onClick={handleSignOut} title={t('authSignOut')}>
              🚪
            </button>
          </div>
        </div>
      </div>

      <nav className="header-nav">
        <button
          className={`nav-btn ${view === 'dashboard' ? 'active' : ''}`}
          onClick={() => setView('dashboard')}
        >
          📊 {t('dashboard')}
        </button>
        <button
          className={`nav-btn ${view === 'list' ? 'active' : ''}`}
          onClick={() => setView('list')}
        >
          📋 {t('savedChecklists')}
          {checklistCount > 0 && <span className="badge">{checklistCount}</span>}
        </button>
        <button
          className={`nav-btn ${view === 'form' ? 'active' : ''}`}
          onClick={() => setView('form')}
        >
          ➕ {t('newChecklist')}
        </button>
        <button
          className={`nav-btn ${view === 'forklifts' ? 'active' : ''}`}
          onClick={() => setView('forklifts')}
        >
          🚜 {t('forklifts')}
        </button>
        <button
          className={`nav-btn ${view === 'expedientes' ? 'active' : ''}`}
          onClick={() => setView('expedientes')}
        >
          📁 {t('expTitle')}
        </button>
        {isAdmin && (
          <button
            className={`nav-btn ${view === 'users' ? 'active' : ''}`}
            onClick={() => setView('users')}
          >
            👥 {t('userManagement')}
          </button>
        )}
      </nav>
    </header>
  );
}
