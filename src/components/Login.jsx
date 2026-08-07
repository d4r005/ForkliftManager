import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { languages } from '../data/checklistItems.js';

export default function Login() {
  const { signIn, signUp, resetPassword, error, setError } = useAuth();
  const { lang, setLang, t } = useLang();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { setError(null); setLocalError(''); }, [mode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    setSuccessMsg('');

    if (!email.trim() || !password.trim() && mode !== 'reset') {
      setLocalError(t('authFillFields'));
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        const ok = await signIn(email.trim(), password);
        if (!ok) setLocalError(error || t('authSignInError'));
      } else if (mode === 'signup') {
        const result = await signUp(email.trim(), password);
        if (result.success && result.needsConfirmation) {
          setSuccessMsg(t('authCheckEmail'));
        } else if (!result.success) {
          setLocalError(error || t('authSignUpError'));
        }
      } else if (mode === 'reset') {
        const ok = await resetPassword(email.trim());
        if (ok) setSuccessMsg(t('authResetSent'));
        else setLocalError(t('authResetError'));
      }
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setLoading(false);
    }
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
          <h2>
            {mode === 'signin' && `🔐 ${t('authSignIn')}`}
            {mode === 'signup' && `📝 ${t('authSignUp')}`}
            {mode === 'reset' && `🔑 ${t('authResetPassword')}`}
          </h2>

          {(localError || error) && (
            <div className="alert alert-error">⚠️ {localError || error}</div>
          )}

          {successMsg && (
            <div className="alert alert-success">✅ {successMsg}</div>
          )}

          <div className="form-field">
            <label>{t('authEmail')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@ejemplo.com"
              autoComplete="email"
              required
            />
          </div>

          {mode !== 'reset' && (
            <div className="form-field">
              <label>{t('authPassword')}</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
              />
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? '...' : (
              mode === 'signin' ? t('authSignIn') :
              mode === 'signup' ? t('authSignUp') :
              t('authSendReset')
            )}
          </button>
        </form>

        {/* Mode switcher */}
        <div className="login-switch">
          {mode === 'signin' && (
            <>
              <button className="link-btn" onClick={() => setMode('signup')}>
                {t('authNoAccount')}
              </button>
              <button className="link-btn" onClick={() => setMode('reset')}>
                {t('authForgotPassword')}
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button className="link-btn" onClick={() => setMode('signin')}>
              {t('authHaveAccount')}
            </button>
          )}
          {mode === 'reset' && (
            <button className="link-btn" onClick={() => setMode('signin')}>
              {t('back')}
            </button>
          )}
        </div>

        <div className="login-footer">
          <p>{t('company')}</p>
        </div>
      </div>
    </div>
  );
}
