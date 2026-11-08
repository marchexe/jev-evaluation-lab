'use client';

import React, { useState, type ReactNode } from 'react';
import { useLanguage } from './LanguageProvider';
import { TranslatedText } from './TranslatedText';
import { searchDocuments } from '../src/ui/evidence';
import { compareSearchHits } from '../src/ui/search-comparison';
import type { EvidenceGraph, GraphHit, GraphSearchResult } from '../src/ui/evidence-graph';

export function SearchComparison({ search, graph, disabled, onInspect, renderPath }: {
  search: GraphSearchResult; graph: EvidenceGraph; disabled: boolean;
  onInspect: (hit: GraphHit, mode: 'text' | 'graph') => void;
  renderPath: (hit: GraphHit) => ReactNode;
}) {
  const { t, translatedLabel } = useLanguage();
  const [differencesOnly, setDifferencesOnly] = useState(true);
  const [selected, setSelected] = useState('');
  const rows = compareSearchHits(search.baseline, search.hits);
  const shown = differencesOnly ? rows.filter(row => row.change !== 'same_rank') : rows;
  const counts = {
    both: rows.filter(row => row.textRank !== null && row.graphRank !== null).length,
    graph: rows.filter(row => row.change === 'graph_only').length,
    text: rows.filter(row => row.change === 'text_only').length,
    moved: rows.filter(row => row.change === 'rank_changed').length,
  };
  const labels = { graph_only: t('Nur Graph'), text_only: t('Nur Text'), rank_changed: t('Andere Position'), same_rank: t('Gleiche Position') };
  return <section className="search-comparison" aria-label={t('Suchergebnisse vergleichen')}>
    <div className="comparison-overview">
      <p><strong>{search.baseline.length}</strong> {t('Textsuche')} · <strong>{search.hits.length}</strong> {t('Graphsuche')}</p>
      <p className="view-note">{counts.both} {t('in beiden')} · {counts.graph} {t('nur Graph')} · {counts.text} {t('nur Text')} · {counts.moved} {t('verschoben')}</p>
      <label><input type="checkbox" aria-label={t('Nur Unterschiede')} checked={differencesOnly} onChange={event => setDifferencesOnly(event.target.checked)} /> {t('Nur Unterschiede')}</label>
    </div>
    <p className="view-note comparison-help">{t('Eine Zeile pro Abschnitt. Zahlen zeigen die Position, nicht die Qualität. Quelle öffnen, um Text und Suchweg hier zu lesen.')}</p>
    {!!search.limitsReached.length && <p className="notice">{t('Suchgrenzen erreicht:')} {search.limitsReached.join(', ')}. {t('Nicht alle möglichen Ergebnisse wurden ausgegeben.')}</p>}
    <table className="lab-table comparison-source-table" aria-label={t('Quellen nach Suchverfahren')}>
      <thead><tr><th scope="col">{t('Quelle')}</th><th scope="col">{t('Textsuche')}</th><th scope="col">{t('Graphsuche')}</th><th scope="col">{t('Unterschied')}</th></tr></thead>
      <tbody>{shown.map(row => {
        const passage = row.hit.passage;
        const doc = searchDocuments.find(entry => entry.id === passage.documentId && entry.revision === passage.revision);
        const open = selected === passage.id;
        const graphHit = search.hits.find(hit => hit.passage.id === passage.id);
        const textHit = search.baseline.find(hit => hit.passage.id === passage.id);
        const panelId = `comparison-passage-${encodeURIComponent(passage.id)}`;
        return <React.Fragment key={passage.id}>
          <tr data-passage-id={passage.id} data-text-rank={row.textRank ?? ''} data-graph-rank={row.graphRank ?? ''} className={open ? 'comparison-row-selected' : ''}>
            <th scope="row"><button type="button" className="comparison-source-button" disabled={disabled}
              aria-expanded={open} aria-controls={panelId} onClick={() => setSelected(open ? '' : passage.id)}>
              <strong>{translatedLabel(doc?.title ?? passage.documentId)}</strong>
              <span>{translatedLabel(passage.section.split(' / ').at(-1) ?? '')} · {t('Version')} {passage.revision}</span>
              <span className="source-open-label">{open ? t('Schließen') : t('Quelle öffnen')} {open ? '▴' : '▾'}</span>
            </button></th>
            <td>{row.textRank === null ? <span className="missing-result">{t('Nicht ausgegeben')}</span> : <span className="number">#{row.textRank}</span>}</td>
            <td>{row.graphRank === null ? <span className="missing-result">{t('Nicht ausgegeben')}</span> : <span className="number">#{row.graphRank}</span>}</td>
            <td><span className={`comparison-change change-${row.change}`}>{labels[row.change]}</span></td>
          </tr>
          {open && <tr id={panelId} className="comparison-expanded"><td colSpan={4}>
            <div className="comparison-inline-source" role="region" aria-label={t('Ausgewählte Vergleichsquelle')}>
              <p className="source-caption">{translatedLabel(passage.section)} · {t('Version')} {passage.revision} · {t('Zeilen')} {passage.startLine}–{passage.endLine}</p>
              <blockquote><TranslatedText text={passage.text} /></blockquote>
              <dl className="comparison-explanation"><dt>{t('Textsuche')}</dt><dd>{textHit ? `${t('Suchbegriffe:')} ${textHit.matchedTerms.map(translatedLabel).join(', ')}` : t('In den ausgegebenen Texttreffern nicht enthalten.')}</dd>
                <dt>{t('Graphsuche')}</dt><dd>{!graphHit ? t('In den ausgegebenen Graphtreffern nicht enthalten.') : graphHit.path.steps.length === 0 ? t('Über Texttreffer gefunden. Ein Graphpfad war hierfür nicht erforderlich.') : graphHit.path.seed.kind === 'lexical' ? t('Von einem Texttreffer über dokumentierte Verknüpfungen gefunden.') : t('Vom gewählten Kontrollknoten über dokumentierte Verknüpfungen gefunden.')}</dd></dl>
              {graphHit && graphHit.path.steps.length > 0 && <>
                <ol className="comparison-path" aria-label={t('Suchweg')}>
                  {graphHit.path.nodeIds.map((id, index) => {
                    const node = graph.nodes.find(entry => entry.id === id);
                    const label = node?.kind === 'passage' ? t(index === graphHit.path.nodeIds.length - 1 ? 'Gefundener Abschnitt' : 'Quelltext') : translatedLabel(node?.label ?? id);
                    return <li key={`${index}:${id}`}>{label}</li>;
                  })}
                </ol>
                <p className="view-note">{t('Verknüpfungen erklären den Fund, bestätigen aber nicht die Aussage.')}</p>
              </>}
              <div className="comparison-inline-actions"><button disabled={disabled} onClick={() => onInspect(graphHit ?? textHit!, graphHit ? 'graph' : 'text')}>{t('Diesen Abschnitt bewerten')}</button></div>
              <details className="comparison-technical"><summary>{t('Technische Quellenangaben')}</summary>
                <code>{passage.id}</code><p className="view-note">{t('UTF-16-Zeichenpositionen')} [{passage.start}, {passage.end})</p>
                {graphHit && renderPath(graphHit)}
              </details>
            </div>
          </td></tr>}
        </React.Fragment>;
      })}</tbody>
    </table>
    {!shown.length && <p className="search-empty">{rows.length ? t('Keine Unterschiede in den ausgegebenen Ergebnissen. Alle Quellen über den Filter anzeigen.') : t('Beide Verfahren liefern keine Treffer. Das belegt keine fehlende Kontrolle.')}</p>}
    <p className="view-note comparison-footnote">{t('Nicht ausgegeben bedeutet nur: nicht in dieser Ergebnisliste. Keine Relevanz- oder Compliance-Bewertung.')}</p>
  </section>;
}
