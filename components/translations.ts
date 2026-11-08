import entries from './translations.de.json' with { type: 'json' };

const translations: Record<string, string> = Object.fromEntries(entries);

/** Display-only exact matches. Never translate request bodies, stored evidence or exports. */
export function translationFor(text: string): string | null {
  const exact = translations[text.trim()];
  if (exact) return exact;
  if (text.includes('\n') || text.includes(' / ')) {
    const parts = text.split(/(\n+| \/ )/);
    const translated = parts.map(part => {
      if (!part.trim() || part === ' / ') return part;
      const heading = part.match(/^(#+ )(.+)$/);
      return heading ? translations[heading[2]] ? heading[1] + translations[heading[2]] : null : translations[part.trim()] ?? null;
    });
    if (translated.every(part => part !== null)) return translated.join('');
  }
  return null;
}

/** Short labels keep technical IDs as a fallback; prose uses TranslatedText instead. */
export function translatedLabel(text: string) { return translationFor(text) ?? text; }
