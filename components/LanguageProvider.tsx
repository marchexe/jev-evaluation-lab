'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import english from './ui.en.json';
import { displayLabel } from './labels';
import { translatedLabel } from './translations';

type Language = 'de' | 'en';
const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void }>({ language: 'de', setLanguage: () => {} });
const catalog: Record<string, string> = english;

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setCurrentLanguage] = useState<Language>('de');
  useEffect(() => {
    try { const saved = localStorage.getItem('jev.ui.language'); if (saved === 'de' || saved === 'en') setCurrentLanguage(saved); } catch { /* Storage is optional. */ }
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  function setLanguage(next: Language) {
    setCurrentLanguage(next);
    try { localStorage.setItem('jev.ui.language', next); } catch { /* Keep the current session usable. */ }
  }
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const { language, setLanguage } = useContext(LanguageContext);
  const t = (text: string): string => language === 'de' ? text : catalog[text] ?? text;
  return {
    language, setLanguage, t,
    displayLabel: (value: string) => language === 'de' ? displayLabel(value) : catalog[displayLabel(value)] ?? value.replaceAll('_', ' '),
    translatedLabel: (text: string) => language === 'de' ? translatedLabel(text) : text,
  };
}

export function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();
  return <label className="language-selector" title={t('Sprache wählen')}>
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" />
    </svg>
    <span aria-hidden="true">{language.toUpperCase()}</span>
    <select aria-label={t('Sprache wählen')} value={language} onChange={event => setLanguage(event.target.value as Language)}>
      <option value="de">Deutsch</option><option value="en">English</option>
    </select>
  </label>;
}
