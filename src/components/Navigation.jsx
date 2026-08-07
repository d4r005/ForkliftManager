import { useLang } from '../i18n/LanguageContext.jsx';
import { Capacitor } from '@capacitor/core';

export default function Navigation({ view, setView, checklistCount, isAdmin }) {
  const { t } = useLang();
  const platform = Capacitor.getPlatform();
  const isAndroid = platform === 'android';

  const navItems = [
    { id: 'dashboard', label: t('dashboard'), icon: '📊' },
    { id: 'list', label: t('savedChecklists'), icon: '📋', badge: checklistCount },
    { id: 'form', label: t('newChecklist'), icon: '➕' },
    { id: 'forklifts', label: t('forklifts'), icon: '🚜' },
    { id: 'expedientes', label: t('expTitle'), icon: '📁' },
  ];

  if (isAdmin) {
    navItems.push({ id: 'users', label: t('userManagement'), icon: '👥' });
  }

  if (isAndroid) {
    return (
      <nav className="bottom-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`bottom-nav-btn ${view === item.id ? 'active' : ''}`}
            onClick={() => setView(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav className="side-nav">
      <div className="side-nav-items">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`side-nav-btn ${view === item.id ? 'active' : ''}`}
            onClick={() => setView(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}
