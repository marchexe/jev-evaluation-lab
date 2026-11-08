'use client';

import type { Passage } from '../src/ui/evidence';
import { useLanguage } from './LanguageProvider';

/** Render the bundled heading/paragraph format. Source strings remain unchanged. */
export function SourceDocument({ content, onReference, onPassage, passages = [], focusLines }: {
  content: string; onReference?: (target: string) => void; onPassage?: (passage: Passage) => void;
  passages?: Passage[]; focusLines?: [number,number];
}) {
  const { t, translatedLabel } = useLanguage();
  const original = content.split(/\r?\n/);
  const translated = translatedLabel(content).split(/\r?\n/);
  // Keep source-line anchors tied to originals if a translation changes line structure.
  const lines = translated.length === original.length ? translated : original.map(translatedLabel);
  function inline(text: string) {
    return text.split(/(\[[^\]]+\]\(evidence:[^)]+\))/).map((part, index) => {
      const reference = part.match(/^\[([^\]]+)\]\((evidence:[^)]+)\)$/);
      return reference && onReference ? <button type="button" className="source-reference-link" key={index} onClick={() => onReference(reference[2])}>{reference[1]}</button> : reference ? <span className="source-reference-label" title={reference[2]} key={index}>{reference[1]}</span> : part;
    });
  }
  return <div className="source-document">{lines.map((line, index) => {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) return heading[1].length === 1 ? <h4 key={index}>{heading[2]}</h4> : <h5 key={index}>{heading[2]}</h5>;
    const passage = passages.find(passage => passage.startLine === index + 1);
    const selected = !!focusLines && index + 1 >= focusLines[0] && index + 1 <= focusLines[1];
    return line.trim() ? <p key={index} data-source-line={index+1} data-passage-id={passage?.id} tabIndex={selected ? -1 : undefined} className={selected ? 'selected-document-passage' : undefined}>{inline(line)}
      {passage && onPassage && <button type="button" className="document-evidence-action" onClick={() => onPassage(passage)}>{t('In Evidence öffnen')}</button>}
    </p> : null;
  })}</div>;
}
