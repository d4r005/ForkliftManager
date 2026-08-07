import { useState, useEffect } from 'react';
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

  useEffect(() => { setError(null); setLocalError(''); }, []);

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

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Brand */}
        <div className="login-brand">
          <div className="brand-logo login-logo">M</div>
          <h1>MontaControl</h1>
          <p>{t('appSubtitle')}</p>
          <p className="login-norm">{t('normRef')}</p>
        </div>

        {/* Language selector */}
        <div className="login-lang">
          {languages.map(l => (
            <button
              key={l.code}
              className={`lang-btn ${lang === l.code ? 'active' : ''}`}
              onClick={() => setLang(l.code)}
            >
              <span className="lang-flag">{l.flag}</span>
              <span className="lang-code">{l.code.toUpperCase()}</span>
            </button>
          ))}
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
          <p className="footer-sub">MontaControl v2.0 — ES · EN · 中文 · Tiếng Việt</p>
        </div>
      </div>
    </div>
  );
}
