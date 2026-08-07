import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations } from './translations.js';

const LanguageContext = createContext();
const STORAGE_KEY = 'montacontrol_lang';

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved || 'es';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key) => {
    const dict = translations[lang] || translations.es;
    return dict[key] !== undefined ? dict[key] : key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}
