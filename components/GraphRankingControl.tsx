'use client';

import type { GraphRanking, GraphRankingInfo } from '../src/ui/graph-ranking';

export function GraphRankingControl({ value, onChange, disabled, language = 'en', info }: {
  value: GraphRanking; onChange: (value: GraphRanking) => void; disabled?: boolean; language?: string; info?: GraphRankingInfo;
}) {
  const de = language === 'de';
  return <div className="graph-ranking-control">
    <label>{de ? 'Graphsortierung' : 'Graph ranking'}<select aria-label={de ? 'Graphsortierung' : 'Graph ranking'} value={value} disabled={disabled}
      onChange={event => onChange(event.target.value as GraphRanking)}>
      <option value="document-diversity-1">{de ? 'Verschiedene Dokumente zuerst (experimentell)' : 'Different documents first (experimental)'}</option>
      <option value="lexical-path-1">{de ? 'Bisherige Reihenfolge: Begriffe und Pfadlänge' : 'Original order: terms and path length'}</option>
    </select></label>
    <p className="view-note">{value === 'document-diversity-1'
      ? (de ? 'Zuerst ein Abschnitt je Dokumentrevision. Danach weitere Abschnitte. Keine Bewertung der Relevanz.' : 'One passage per document revision first. Then remaining passages. This does not judge relevance.')
      : (de ? 'Mehr Begriffstreffer zuerst, danach kürzere Pfade. Textsuche bleibt unverändert.' : 'More term matches first, then shorter paths. Text Search is unchanged.')}</p>
    {info && <p className="view-note">{info.changes.length} {de ? 'Positionen geändert;' : 'positions changed;'} {info.documentRevisions} {de ? 'Dokumentversionen. Alte und neue Ränge sind im JSON-Export enthalten.' : 'document versions. Original and new ranks are included in JSON exports.'}</p>}
  </div>;
}
