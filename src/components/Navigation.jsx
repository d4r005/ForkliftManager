import { useLang } from '../i18n/LanguageContext.jsx';
import { Capacitor } from '@capacitor/core';

export default function Navigation({ view, setView, checklistCount, isAdmin }) {
  const { t } = useLang();
  const platform = Capacitor.getPlatform();
  const isAndroid = platform === 'android';

  // En Android usamos labels cortos (Dashboard, Usuarios, ...) porque el
  // bottom-nav tiene poco espacio horizontal con hasta 6 botones — con los
  // labels completos ("Panel principal", "Gestión de usuarios") el texto se
  // salía de su columna y se traslapaba con el botón vecino.
  const navItems = isAndroid ? [
    { id: 'dashboard', label: t('navDashboard'), icon: '📊' },
    { id: 'list', label: t('navList'), icon: '📋', badge: checklistCount },
    { id: 'form', label: t('navNew'), icon: '➕' },
    { id: 'forklifts', label: t('navForklifts'), icon: '🚜' },
    { id: 'expedientes', label: t('navExp'), icon: '📁' },
  ] : [
    { id: 'dashboard', label: t('dashboard'), icon: '📊' },
    { id: 'list', label: t('savedChecklists'), icon: '📋', badge: checklistCount },
    { id: 'form', label: t('newChecklist'), icon: '➕' },
    { id: 'forklifts', label: t('forklifts'), icon: '🚜' },
    { id: 'expedientes', label: t('expTitle'), icon: '📁' },
  ];

  if (isAdmin) {
    navItems.push({ id: 'users', label: isAndroid ? t('navUsers') : t('userManagement'), icon: '👥' });
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
        {isAdmin && (
          <button className={`nav-item ${view === 'designer' ? 'active' : ''}`} onClick={() => setView('designer')}>
            🎨 <span className="nav-label">Diseñador PDF</span>
          </button>
        )}
      </div>
    </nav>
  );
}
