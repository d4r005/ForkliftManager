import { useState, useRef, useEffect } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { languages } from '../data/checklistItems.js';
import logoMark from '../assets/logo-mark.png';

export default function Header({ view, setView, checklistCount }) {
  const { lang, setLang, t } = useLang();
  const { user, signOut } = useAuth();
  const [showUserPanel, setShowUserPanel] = useState(false);
  const panelRef = useRef(null);

  const handleSignOut = () => {
    if (confirm(t('authSignOutConfirm'))) signOut();
  };

  const isAdmin = user?.role === 'admin';
  const currentLang = languages.find(l => l.code === lang);

  useEffect(() => {
    if (!showUserPanel) return;
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowUserPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserPanel]);

  return (
    <header className="app-header">
      <div className="header-top">
        <div className="header-brand" onClick={() => setView('dashboard')}>
          <img src={logoMark} alt="ForkliftManager" className="brand-logo" />
          <div className="brand-text">
            <h1>ForkliftManager</h1>
            <p>{t('appSubtitle')}</p>
          </div>
        </div>

        <div className="header-controls">
          {/* User panel trigger */}
          <div className="user-panel-wrap" ref={panelRef}>
            <button className="user-menu" onClick={() => setShowUserPanel(v => !v)}>
              <div className="user-avatar" title={user?.name}>
                {user?.photoPath ? (
                  <UserAvatarPhoto path={user.photoPath} />
                ) : (
                  isAdmin ? '🛡️' : '👤'
                )}
              </div>
              <div className="user-info-text">
                <span className="user-name">{user?.name || user?.employeeNumber}</span>
                <span className="user-emp">#{user?.employeeNumber}</span>
              </div>
              <span className="user-panel-chevron">{showUserPanel ? '▲' : '▼'}</span>
            </button>

            {showUserPanel && (
              <div className="user-panel-dropdown">
                <div className="user-panel-section">
                  <div className="user-panel-label">🌐 {t('language')}</div>
                  <div className="user-panel-langs">
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
                </div>
                <div className="user-panel-divider" />
                <button className="user-panel-signout" onClick={handleSignOut}>
                  🚪 {t('authSignOut')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation removed and moved to Navigation component */}
    </header>
  );
}

function UserAvatarPhoto({ path }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase.storage.from('expedientes').createSignedUrl(path, 300);
        if (active) {
          if (error) setErr(true);
          else setUrl(data.signedUrl);
        }
      } catch { if (active) setErr(true); }
    })();
    return () => { active = false; };
  }, [path]);

  if (err || !url) return <span>👤</span>;
  return (
    <img src={url} alt="" className="user-avatar-img"
      onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} />
  );
}
