'use client';

import { type ReactNode } from 'react';
import { translationFor } from './translations';
import { useLanguage } from './LanguageProvider';

export function TranslatedText({ text, original }: { text: string; original?: ReactNode }) {
  const { language, t } = useLanguage();
  const translated = translationFor(text);
  if (original) return <>{original}</>;
  if (language === 'en') return <span className="original-language-copy" lang="en">{original ?? text}</span>;
  return <span className="translated-text">
    <span className="translated-copy" lang={translated ? 'de' : undefined}>{translated ?? text}</span>
    {translated && <span className="translation-tools"><small>{t('Übersetzung')}</small></span>}
  </span>;
}
