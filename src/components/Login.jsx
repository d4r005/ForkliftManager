import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { languages } from '../data/checklistItems.js';

export default function Login() {
  const { signIn, error, setError } = useAuth();
  const { lang, setLang, t } = useLang();
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLangPanel, setShowLangPanel] = useState(false);
  const langPanelRef = useRef(null);

  useEffect(() => { setError(null); setLocalError(''); }, []);

  useEffect(() => {
    if (!showLangPanel) return;
    const handleClickOutside = (e) => {
      if (langPanelRef.current && !langPanelRef.current.contains(e.target)) {
        setShowLangPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showLangPanel]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!employeeNumber.trim() || !password.trim()) {
      setLocalError(t('authFillFields'));
      return;
    }

    setLoading(true);
    const ok = await signIn(employeeNumber.trim(), password);
    if (!ok) {
      const msg = error || t('authSignInError');
      // Translate error codes
      if (msg === 'user_not_found') setLocalError(t('authUserNotFound'));
      else if (msg === 'invalid_password') setLocalError(t('authInvalidPassword'));
      else setLocalError(msg);
    }
    setLoading(false);
  };

  const currentLang = languages.find(l => l.code === lang);

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Language panel toggle */}
        <div className="login-lang-panel-wrap" ref={langPanelRef}>
          <button
            type="button"
            className="login-lang-trigger"
            onClick={() => setShowLangPanel(v => !v)}
            title={t('language')}
          >
            <span className="lang-flag">{currentLang?.flag}</span>
            <span className="lang-code">{currentLang?.code.toUpperCase()}</span>
            <span className="user-panel-chevron">{showLangPanel ? '▲' : '▼'}</span>
          </button>

          {showLangPanel && (
            <div className="login-lang-dropdown">
              <div className="user-panel-label">🌐 {t('language')}</div>
              <div className="user-panel-langs">
                {languages.map(l => (
                  <button
                    key={l.code}
                    type="button"
                    className={`lang-btn ${lang === l.code ? 'active' : ''}`}
                    onClick={() => { setLang(l.code); setShowLangPanel(false); }}
                  >
                    <span className="lang-flag">{l.flag}</span>
                    <span className="lang-code">{l.code.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Brand */}
        <div className="login-brand">
          <div className="brand-logo login-logo">FM</div>
          <h1>ForkliftManager</h1>
          <p>{t('appSubtitle')}</p>
          <p className="login-norm">{t('normRef')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <h2>🔐 {t('authSignIn')}</h2>

          {localError && (
            <div className="alert alert-error">⚠️ {localError}</div>
          )}

          <div className="form-field">
            <label>{t('authEmployeeNumber')}</label>
            <input
              type="text"
              value={employeeNumber}
              onChange={e => setEmployeeNumber(e.target.value)}
              placeholder={t('authEmployeePlaceholder')}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-field">
            <label>{t('authPassword')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? '...' : t('authSignIn')}
          </button>
        </form>

        <div className="login-footer">
          <p>{t('company')}</p>
          <p className="footer-sub">ForkliftManager v2.0 — ES · EN · 中文 · Tiếng Việt</p>
        </div>
      </div>
    </div>
  );
}
