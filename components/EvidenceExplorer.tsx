'use client';
import { useLanguage } from './LanguageProvider';
import { TranslatedText } from './TranslatedText';
import type { EvidenceSelection } from './DocumentLibrary';
import { SearchComparison } from './SearchComparison';
import { SourceDocument } from './SourceDocument';
import { GraphRankingControl } from './GraphRankingControl';
import type { GraphRanking } from '../src/ui/graph-ranking';



import React, { useEffect, useMemo, useState } from 'react';
import { downloadJson } from '../src/ui/history';
import { EVIDENCE_RUNS_KEY, writeEvidenceRuns, type EvidenceRun } from '../src/ui/evidence-runs';
import { EvidenceJudgments } from './EvidenceJudgments';
import { DATASET_VERSION, SEARCH_DATASET_VERSION, EVIDENCE_KEY, searchControls, searchDocuments, searchPassages,
  evidenceLabels, relevanceLabels, exportEvidence, readEvidenceReviews,
  saveEvidenceReview, summarizeEvidence, writeEvidenceReviews,
  type EvidenceReview, type Passage } from '../src/ui/evidence';
import { buildEvidenceGraph, searchEvidenceGraph, snapshotEvidenceSearch, graphIds, graphManifest, DEFAULT_GRAPH_LIMITS,
  type GraphHit, type EvidenceGraph } from '../src/ui/evidence-graph';

function SearchReason({ hit, graph }: { hit: GraphHit; graph: EvidenceGraph }) {
  const { t, displayLabel, translatedLabel } = useLanguage();
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  return <details className="type-reference"><summary>{t("Suchpfad ·")} {hit.path.steps.length} {t("Schritte ·")} {displayLabel(hit.path.seed.kind)}{t("-Start")}</summary>
    <p className="view-note">{t("Start:")} {translatedLabel(nodes.get(hit.path.seed.nodeId)?.label ?? '')}{t(". Suchbegriffe:")} {hit.path.seed.matchedTerms.map(translatedLabel).join(', ') || t('keine')}{t(". Verknüpfungen sind keine geprüften Feststellungen.")}</p>
    <ol>{hit.path.steps.map((step, index) => {
      const edge = edges.get(step.edgeId)!; const provenance = edge.provenance;
      return <li key={step.edgeId}><p>{displayLabel(edge.kind)} ({displayLabel(step.direction)}) → {translatedLabel(nodes.get(hit.path.nodeIds[index + 1])?.label ?? '')} · {displayLabel(edge.origin)} · {displayLabel(edge.reviewStatus)}</p>
        <code>{edge.id}</code>
        {provenance.kind === 'source' && <><p className="view-note">{provenance.passage.documentId}@{provenance.passage.revision} / {translatedLabel(provenance.passage.section)} {t("· Zeilen")} {provenance.passage.startLine}–{provenance.passage.endLine} {t("· Zeichenpositionen [")}{provenance.passage.start}, {provenance.passage.end})</p><blockquote className="comparison-description"><TranslatedText text={provenance.quote} /></blockquote></>}
      </li>;
    })}</ol>
  </details>;
}

function PassageReview({ passage, controlId, review, disabled, onSave }: {
  passage: Passage; controlId: string; review?: EvidenceReview; disabled: boolean;
  onSave: (review: EvidenceReview | null) => void;
}) {
  const { t, displayLabel } = useLanguage();
  const [judgment, setJudgment] = useState<EvidenceReview['judgment']>(review?.judgment ?? 'uncertain');
  const [relevance, setRelevance] = useState<EvidenceReview['relevance']>(review?.relevance ?? 'uncertain');
  const [comment, setComment] = useState(review?.comment ?? '');
  useEffect(() => {
    setJudgment(review?.judgment ?? 'uncertain'); setRelevance(review?.relevance ?? 'uncertain'); setComment(review?.comment ?? '');
  }, [review]);
  return <details className="field-review"><summary><span>{t("Meine Bewertung:")}</span> {review ? displayLabel(review.judgment) : t("nicht bewertet")}</summary>
    <div className="review-form">
      <label>{t("Belegaussage")}<select value={judgment} disabled={disabled} onChange={(event) => setJudgment(event.target.value as typeof judgment)}>
        {evidenceLabels.map((label) => <option key={label} value={label}>{displayLabel(label)}</option>)}</select></label>
      <label>{t("Suchrelevanz")}<select value={relevance} disabled={disabled} onChange={(event) => setRelevance(event.target.value as typeof relevance)}>
        {relevanceLabels.map((label) => <option key={label} value={label}>{displayLabel(label)}</option>)}</select></label>
      <label className="review-comment">{t("Kommentar")}<textarea value={comment} maxLength={1000} rows={1} disabled={disabled} onChange={(event) => setComment(event.target.value)} /></label>
      <div className="review-actions"><button disabled={disabled} onClick={() => onSave({ controlId, passage, judgment, relevance, comment, updatedAt: new Date().toISOString() })}>{t("Bewertung speichern")}</button>
        <button disabled={disabled || !review} onClick={() => { onSave(null); setJudgment('uncertain'); setRelevance('uncertain'); setComment(''); }}>{t("Bewertung löschen")}</button></div>
    </div></details>;
}

export function EvidenceExplorer({ summaryOnly = false, liveEnabled = false, isJudging = false, onRunningChange, initialPassage, onOpenDocument, onBrowseDocuments }: {
  initialPassage?: EvidenceSelection; onOpenDocument?: (passage: Passage, controlId: string) => void; onBrowseDocuments?: () => void;
  summaryOnly?: boolean; liveEnabled?: boolean; isJudging?: boolean; onRunningChange: (running: boolean) => void;
}) {
  const { t, displayLabel, translatedLabel, language } = useLanguage();
  const initialSource = searchPassages.find(passage => passage.id === initialPassage?.passageId);
  const [reviews, setReviews] = useState<EvidenceReview[]>([]);
  const [ready, setReady] = useState(false); const [error, setError] = useState('');
  const [controlId, setControlId] = useState(initialPassage?.controlId ?? searchControls[0].id);
  const [systemId, setSystemId] = useState(initialSource?.systemId ?? 'dispatch'); const [showAll, setShowAll] = useState(!!initialSource);
  const [strategy, setStrategy] = useState<'text' | 'graph'>('graph');
  const [ranking, setRanking] = useState<GraphRanking>('document-diversity-1');
  const [focusedPassage, setFocusedPassage] = useState(initialSource?.id ?? '');
  const [notice, setNotice] = useState('');
  const [searchRun, setSearchRun] = useState(0);
  const [maxDepth, setMaxDepth] = useState(DEFAULT_GRAPH_LIMITS.maxDepth); const [includeArchived, setIncludeArchived] = useState(!!initialSource && (graphManifest.currentRevisions[initialSource.documentId] ?? initialSource.revision) !== initialSource.revision);
  useEffect(() => { try { setReviews(readEvidenceReviews(localStorage)); } catch { setError('Bewertungen nicht lesbar. Gespeicherte Daten zuerst exportieren.'); } setReady(true); }, []);
  const control = searchControls.find((entry) => entry.id === controlId)!;
  const graph = useMemo(() => buildEvidenceGraph(undefined, undefined, undefined, reviews), [reviews]);
  const search = useMemo(() => searchEvidenceGraph(graph, { ...DEFAULT_GRAPH_LIMITS, maxDepth, includeArchived, controlId, systemId, ranking }), [graph, maxDepth, includeArchived, controlId, systemId, ranking, searchRun]);
  const snapshot = snapshotEvidenceSearch(graph, search, strategy, reviews);
  const sources = searchDocuments.filter((document) => {
    const revision = graph.nodes.find((node) => node.id === graphIds.revision(document.id, document.revision));
    return document.systemId === systemId && (includeArchived || (revision?.kind === 'revision' && revision.current === true));
  });
  const passages = searchPassages.filter((passage) => sources.some((document) => document.id === passage.documentId && document.revision === passage.revision));
  const candidates = strategy === 'graph' ? search.hits : search.baseline;
  const visible = showAll ? passages : candidates.map((entry) => entry.passage);
  const selectedPassage = visible.find((passage) => passage.id === focusedPassage) ?? visible.find((passage) => passage.documentId === 'dispatch-policy') ?? visible[0];
  useEffect(() => {
    const pane = document.querySelector('.evidence-review-pane');
    if (pane) pane.scrollTop = 0;
  }, [selectedPassage?.id, controlId]);
  function inspect(hit: GraphHit, mode: 'text' | 'graph', reveal = false) {
    setNotice(''); setStrategy(mode); setFocusedPassage(hit.passage.id);
    requestAnimationFrame(() => { const panel = document.getElementById('passage-inspector'); const pane = panel?.closest('.evidence-review-pane'); if (pane) pane.scrollTop = 0; panel?.focus({ preventScroll: true }); if (reveal) panel?.scrollIntoView({ block: 'center' }); });
  }
  const stats = summarizeEvidence(reviews);
  function save(passage: Passage, review: EvidenceReview | null) {
    try {
      const next = saveEvidenceReview(reviews, review, controlId, passage);
      writeEvidenceReviews(localStorage, next); setReviews(next); setNotice(review ? 'Bewertung gespeichert.' : 'Bewertung gelöscht.');
    } catch { setError('Speichern fehlgeschlagen. Bewertungen zuerst exportieren.'); }
  }
  function exportStored() {
    try { downloadJson('jev-evidence-storage.json', localStorage.getItem(EVIDENCE_KEY) ?? 'null'); }
    catch { setError('Browserspeicher nicht verfügbar. Gespeicherte Daten unverändert.'); }
  }
  function importExperiment(runs: EvidenceRun[], nextReviews: EvidenceReview[]) {
    const beforeRuns = localStorage.getItem(EVIDENCE_RUNS_KEY), beforeReviews = localStorage.getItem(EVIDENCE_KEY);
    try { writeEvidenceRuns(localStorage, runs); writeEvidenceReviews(localStorage, nextReviews); }
    catch {
      try {
        if (beforeRuns === null) localStorage.removeItem(EVIDENCE_RUNS_KEY); else localStorage.setItem(EVIDENCE_RUNS_KEY, beforeRuns);
        if (beforeReviews === null) localStorage.removeItem(EVIDENCE_KEY); else localStorage.setItem(EVIDENCE_KEY, beforeReviews);
      } catch { setError('Import und Wiederherstellung fehlgeschlagen. Rohdaten exportieren.'); }
      throw new Error('Import nicht gespeichert. Gespeicherte Daten prüfen und exportieren.');
    }
    setReviews(nextReviews);
  }
  const reviewProgress = (<details className="review-progress" open={summaryOnly || undefined}><summary>{t("Bewertungen ·")} {stats.reviewed} {t("Beleg-Kontroll-Paare")}</summary><p className="view-note" aria-live="polite">{t("Bewertete Beleg-Kontroll-Paare:")} {stats.reviewed}. {evidenceLabels.map((label) => `${displayLabel(label)}: ${stats.counts[label]}`).join(' · ')}.</p>
    <p className="view-note">{t("Textsuche: gefunden")} {stats.retrievedRelevant} / {stats.relevant} {t("manuell relevante Abschnitte; übersehen")} {stats.missedRelevant}{t(". Nur bewertete Abschnitte; Suchqualität und Klassifikation getrennt.")}</p>
    </details>);
  return <section className={`lab-view ${summaryOnly ? '' : 'evidence-workspace'}`} aria-label={summaryOnly ? t("Evidence evaluation") : t("Belegsuche")}>
    <div className={summaryOnly ? "view-heading" : "evidence-heading"}>{summaryOnly && <h2>{t("Belegbewertungen")}</h2>}
      {summaryOnly && <button disabled={!ready || !!error} onClick={() => downloadJson('jev-evidence.json', JSON.stringify({ ...JSON.parse(exportEvidence(reviews)), search: snapshot }, null, 2))}>{t("Belege und Bewertungen exportieren")}</button>}</div>
    <p className="view-note">{t("Synthetische Quellen · lokale Suche · keine Compliance-Prüfung.")}</p>
    {error && <div role="alert" className="notice error">{t(error)} <button onClick={exportStored}>{t("Gespeicherte Belege exportieren")}</button></div>}

    {!summaryOnly && <>
      <div className="evidence-query">
      <div className="comparison-selectors"><label>{t("Kontrolle")}<select aria-label={t("Kontrolle")} disabled={isJudging} value={controlId} onChange={(event) => setControlId(event.target.value)}>{searchControls.map((entry) => <option key={entry.id} value={entry.id}>{entry.id === 'human-oversight' ? t("Menschliche Aufsicht") : entry.id === 'two-person-gate' ? t("Vier-Augen-Prinzip") : entry.title}</option>)}</select></label>
        <label>{t("System")}<select disabled={isJudging} value={systemId} onChange={(event) => setSystemId(event.target.value)}>{[...new Set(searchDocuments.map((entry) => entry.systemId))].map((id) => <option key={id}>{id}</option>)}</select></label></div>
      <div className="control-statement"><span>{t("Zu prüfende Aussage")}</span><TranslatedText text={control.statement} /></div>
      <button className="primary" disabled={isJudging || !ready} onClick={() => { setSearchRun(value => value + 1); setFocusedPassage(''); setShowAll(false); setStrategy('graph'); setNotice('Lokale Suche aktualisiert. Kein Jev-Aufruf.'); }}>{t("Quellen finden")}</button></div>
      <div className="evidence-workbench"><div className="evidence-search-pane">
      <div className="source-library-link">{onBrowseDocuments && <button disabled={isJudging} onClick={onBrowseDocuments}>{t('Alle Dokumente')}</button>}</div>
      <section className="source-results" aria-label={t("Gefundene Quellen")}>
        <header><h3>{showAll ? t("Alle Abschnitte") : t("Gefundene Abschnitte")} <span className="count">{visible.length}</span> <span className="source-method">{showAll ? t('Alle Abschnitte') : strategy === 'graph' ? t("Graphsuche") : t("Textsuche")}</span></h3><p className="view-note">{showAll ? t("Alle Abschnitte; nicht alle wurden gefunden.") : t("Suchtreffer, noch keine geprüften Aussagen.")}</p></header>
        {!visible.length && <p className="search-empty">{t("Keine Treffer. Alle Quellen lassen sich unten öffnen.")}</p>}
        {visible.map((passage, index) => {
          const hit = candidates.find(entry => entry.passage.id === passage.id);
          const doc = sources.find(entry => entry.id === passage.documentId && entry.revision === passage.revision)!;
          const lexical = search.baseline.some(entry => entry.passage.id === passage.id);
          const reference = hit?.path.steps.map(step => graph.edges.find(edge => edge.id === step.edgeId)).find(edge => edge?.kind === 'references');
          const linkedSource = reference?.provenance.kind === 'source' ? reference.provenance.passage : undefined;
          const linkedDocument = linkedSource && searchDocuments.find(doc => doc.id === linkedSource.documentId && doc.revision === linkedSource.revision);
          return <button type="button" className={`search-hit hit-select ${selectedPassage?.id === passage.id ? 'selected' : ''}`} key={passage.id}
            disabled={isJudging} aria-label={`Inspect source result ${passage.id}`} aria-pressed={selectedPassage?.id === passage.id}
            onClick={() => hit ? inspect(hit, strategy) : setFocusedPassage(passage.id)}>
            <span className="hit-rank">{index + 1}</span><span className="hit-content"><strong>{translatedLabel(doc.title)}</strong>
            <span className="source-location">{translatedLabel(passage.section.split(' / ').at(-1) ?? '')} · {t('Version')} {passage.revision}</span>
            <span className="hit-preview">{translatedLabel(passage.text)}</span>
            <span className="hit-label">{!hit ? t("Nicht vom Suchverfahren gefunden") : lexical ? t("Texttreffer") : linkedDocument ? `${t("Verknüpft über")} ${translatedLabel(linkedDocument.title)}` : t("Über Quellenverknüpfung gefunden")}</span></span>
          </button>;
        })}
      </section>
      </div><div className="evidence-review-pane">

      {!visible.length && <p className="empty-results">{t("Keine Treffer. Alle Quellen lassen sich unten öffnen.")}</p>}
      <div id="passage-inspector" tabIndex={-1} className="passage-inspector"><div className="step-label">{t("Quellenprüfung")}</div>
      {visible.filter((passage) => passage.id === selectedPassage?.id).map((passage) => {
        const document = sources.find((entry) => entry.id === passage.documentId && entry.revision === passage.revision)!;
        const match = candidates.find((entry) => entry.passage.id === passage.id);
        const review = reviews.find((entry) => entry.controlId === controlId && entry.passage.id === passage.id);
        return <article className="evidence-passage" key={passage.id} aria-label={`${translatedLabel(document.title)} / ${translatedLabel(passage.section)}`}>
          <div className="passage-title-row"><h3>{translatedLabel(document.title)}</h3>{onOpenDocument && <button className="open-full-document" disabled={isJudging} onClick={() => onOpenDocument(passage, controlId)}>{t("Vollständiges Dokument öffnen")}</button>}</div><p className="source-caption">{translatedLabel(passage.section)} · {t("Version")} {passage.revision} · {t("Zeilen")} {passage.startLine}–{passage.endLine}</p><blockquote className="comparison-description"><TranslatedText text={passage.text} /></blockquote>


          <div role="region" className="passage-reason" aria-label={t("Warum gefunden?")}>
            <strong>{t("Warum gefunden?")}</strong>
            {match ? match.path.steps.length === 0 ? <p>{t("Enthält Suchbegriffe der gewählten Kontrolle.")}</p> : <>
              <p>{t("Über dokumentierte Verknüpfungen gefunden.")}</p>
              <p className="reason-source">{(() => {
                const edge = match.path.steps.map(step => graph.edges.find(entry => entry.id === step.edgeId)).find(entry => entry?.kind === 'references');
                if (edge?.provenance.kind !== 'source') return translatedLabel(control.title);
                const source = edge.provenance.passage;
                const doc = searchDocuments.find(entry => entry.id === source.documentId && entry.revision === source.revision);
                return translatedLabel(doc?.title ?? source.documentId) + ' · ' + translatedLabel(source.section.split(' / ').at(-1) ?? '') + ' · ' + t('Version') + ' ' + source.revision;
              })()}</p>
            </> : <p>{t("Nicht vom gewählten Suchverfahren gefunden. Manuell geöffnet.")}</p>}
          </div>
          <PassageReview key={`${controlId}:${passage.id}`} passage={passage} controlId={controlId} review={review} disabled={!ready || !!error} onSave={(value) => save(passage, value)} />
          <details className="source-provenance"><summary>{t("Quellreferenz")}</summary>{strategy === 'graph' && match && <SearchReason hit={match} graph={graph} />}<p className="view-note">{translatedLabel(passage.section)} {t("· Version")} {passage.revision} {t("· Zeilen")} {passage.startLine}–{passage.endLine} {t("· UTF-16-Zeichenpositionen [")}{passage.start}, {passage.end})</p>
          <code className="evidence-source">{passage.id}</code>          <p className="view-note">{match ? `${t('Suchbegriffe:')} ${match.matchedTerms.map(translatedLabel).join(', ') || t('keine; über Verknüpfung gefunden')}` : t("Vom aktuellen Suchverfahren nicht gefunden.")}</p></details>
        </article>;
      })}
      </div>
      {notice && <p role="status" className="notice success">{t(notice)}</p>}
      <details className="machine-review"><summary>{t("Jev-Bewertung")}</summary><p className="view-note">{t("Zuerst selbst bewerten. Jev bewertet den ausgewählten Quellabschnitt. Keine Compliance-Prüfung.")}</p>
        <EvidenceJudgments reviews={reviews} reviewsAvailable={ready && !error} passages={selectedPassage ? [selectedPassage] : []} controlId={controlId} liveEnabled={liveEnabled && !error} compact summaryOnly={false} onRunningChange={onRunningChange} search={snapshot} onImport={importExperiment} /></details>
      </div></div>
      <details className="evidence-tools"><summary>{t("Suchdetails")}</summary>
      <div className="evidence-tool-content">
      <button disabled={!ready || !!error} onClick={() => downloadJson('jev-evidence.json', JSON.stringify({ ...JSON.parse(exportEvidence(reviews)), search: snapshot }, null, 2))}>{t("Belege und Bewertungen exportieren")}</button>
      <details className="search-settings"><summary>{t("Sucheinstellungen")}</summary>
      <div className="comparison-selectors"><label>{t("Suchverfahren für Bewertung und Export")}<select disabled={isJudging} value={strategy} onChange={(event) => setStrategy(event.target.value as typeof strategy)}><option value="text">{t("Textsuche")}</option><option value="graph">{t("Graphsuche")}</option></select></label>
        <label>{t("Suchtiefe")}<select disabled={isJudging} value={maxDepth} onChange={(event) => setMaxDepth(Number(event.target.value))}>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((depth) => <option key={depth}>{depth}</option>)}</select></label></div>
      <GraphRankingControl value={ranking} onChange={setRanking} disabled={isJudging} language={language} info={search.ranking} />
      <label><input type="checkbox" disabled={isJudging} checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> {t("Archivierte Versionen einbeziehen")}</label>
      <p className="view-note">{candidates.length} {t("Treffer /")} {passages.length} {t("Abschnitte aus")} {sources.length} {language === 'de' ? 'Dokumentrevisionen.' : 'document revisions.'}</p>
      <p className="view-note">{t("Graphsuche:")} {search.visited}/{search.query.maxVisited} {t("besuchte Knoten;")} {search.edgesExamined}/{search.query.maxEdges} {t("geprüfte Kanten. Grenzen:")} {search.limitsReached.join(', ') || 'keine'}.</p>
      <details><summary>{t("Verknüpfungen und offene Verweise (")}{search.diagnostics.length + search.excludedReferences.length})</summary>
        {search.diagnostics.map((entry) => <p className="view-note" key={entry.id}><TranslatedText text={entry.message} /> <code>{entry.target}</code></p>)}
        {search.excludedReferences.map((entry) => <p className="view-note" key={entry.edgeId}><TranslatedText text={entry.reason} /> <code>{entry.edgeId}</code></p>)}
      </details></details>
      <details className="search-comparison-details"><summary>{t("Suchverfahren vergleichen")}</summary>
      <SearchComparison key={`${controlId}:${systemId}:${includeArchived}`} search={search} graph={graph} disabled={isJudging}
        onInspect={(hit, mode) => inspect(hit, mode, true)} renderPath={hit => <SearchReason hit={hit} graph={graph} />} />
      </details>
      <details className="type-reference"><summary>{t("Suchvergleich – Details")}</summary><p className="view-note" aria-live="polite">{t("Suchvergleich für")} {systemId} / {translatedLabel(control.title)}, {includeArchived ? t("alle referenzierten Versionen") : t("aktuelle Versionen")}{t(": Textsuche")} {search.baseline.length}{t("; Graphsuche")} {search.hits.length}{t(". Bewertete relevante Belege: Text")} {snapshot.reviewedPool.text.retrievedRelevant}/{snapshot.reviewedPool.text.relevant}{t("; graph")} {snapshot.reviewedPool.graph.retrievedRelevant}/{snapshot.reviewedPool.graph.relevant}{t(". Manuelle Bewertungsverknüpfungen werden nicht durchsucht.")}</p></details>
      <details className="source-browser-details"><summary>{t("Alle Quellen durchsuchen")}</summary>
      <div className="source-browser">
      <label><input type="checkbox" disabled={isJudging} checked={showAll} onChange={(event) => setShowAll(event.target.checked)} /> {t("Alle Quellabschnitte anzeigen")}</label>
      <label>{t("Quellabschnitt")}<select aria-label={t("Quellabschnitt")} disabled={isJudging || !visible.length} value={selectedPassage?.id ?? ''} onChange={(event) => setFocusedPassage(event.target.value)}>{!visible.length && <option value="">{t("Kein Abschnitt ausgewählt")}</option>}{visible.map((passage) => <option value={passage.id} key={passage.id}>{translatedLabel(sources.find((doc) => doc.id === passage.documentId)?.title ?? '')} · {translatedLabel(passage.section.split(' / ').at(-1) ?? '')} {t("· Version")} {passage.revision}</option>)}</select></label></div>

      </details>
      <details className="type-reference source-documents"><summary>{t("Quelldokumente")}</summary>
        <p className="view-note">{t("Synthetische Demo-Dokumente aus dem Projekt. Keine Unternehmensdaten und keine Websuche.")}</p>
        {sources.map((document) => <details key={`${document.id}@${document.revision}`}><summary>{translatedLabel(document.title)} · {t("Version")} {document.revision}</summary><SourceDocument content={document.content} /></details>)}
        <details><summary>{t("Datensatzdetails")}</summary><p className="view-note">{t("Datensatz")} {DATASET_VERSION}{t("; Suchkorpus")} {SEARCH_DATASET_VERSION}</p>{sources.map(document => <p key={`${document.id}@${document.revision}`}><code>{document.id}@{document.revision}</code></p>)}</details>
      </details>
      {reviewProgress}
      </div></details>
    </>}
    {summaryOnly && reviewProgress}
    {summaryOnly && <EvidenceJudgments reviews={reviews} reviewsAvailable={ready && !error} passages={visible} controlId={controlId} liveEnabled={liveEnabled && !error} summaryOnly onRunningChange={onRunningChange} search={snapshot} onImport={importExperiment} />}
  </section>;
}
