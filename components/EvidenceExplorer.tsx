'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { downloadJson } from '../src/ui/history';
import { EVIDENCE_RUNS_KEY, writeEvidenceRuns, type EvidenceRun } from '../src/ui/evidence-runs';
import { EvidenceJudgments } from './EvidenceJudgments';
import { DATASET_VERSION, SEARCH_DATASET_VERSION, EVIDENCE_KEY, searchControls, searchDocuments, searchPassages,
  evidenceLabels, relevanceLabels, exportEvidence, readEvidenceReviews,
  saveEvidenceReview, summarizeEvidence, writeEvidenceReviews,
  type EvidenceReview, type Passage } from '../src/ui/evidence';
import { buildEvidenceGraph, searchEvidenceGraph, snapshotEvidenceSearch, graphIds, DEFAULT_GRAPH_LIMITS,
  type GraphHit, type EvidenceGraph } from '../src/ui/evidence-graph';

function SearchReason({ hit, graph }: { hit: GraphHit; graph: EvidenceGraph }) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  return <details className="type-reference"><summary>Graph retrieval path · {hit.path.steps.length} hops · {hit.path.seed.kind} seed</summary>
    <p className="view-note">Seed: {nodes.get(hit.path.seed.nodeId)?.label}. Lexical terms: {hit.path.seed.matchedTerms.join(', ') || 'none'}. Source assertions and derived links are not verified findings.</p>
    <ol>{hit.path.steps.map((step, index) => {
      const edge = edges.get(step.edgeId)!; const provenance = edge.provenance;
      return <li key={step.edgeId}><p>{edge.kind} ({step.direction}) → {nodes.get(hit.path.nodeIds[index + 1])?.label} · {edge.origin} · {edge.reviewStatus}</p>
        <code>{edge.id}</code>
        {provenance.kind === 'source' && <><p className="view-note">{provenance.passage.documentId}@{provenance.passage.revision} / {provenance.passage.section} · lines {provenance.passage.startLine}–{provenance.passage.endLine} · offsets [{provenance.passage.start}, {provenance.passage.end})</p><blockquote className="comparison-description">{provenance.quote}</blockquote></>}
      </li>;
    })}</ol>
  </details>;
}

function PassageReview({ passage, controlId, review, disabled, onSave }: {
  passage: Passage; controlId: string; review?: EvidenceReview; disabled: boolean;
  onSave: (review: EvidenceReview | null) => void;
}) {
  const [judgment, setJudgment] = useState<EvidenceReview['judgment']>(review?.judgment ?? 'uncertain');
  const [relevance, setRelevance] = useState<EvidenceReview['relevance']>(review?.relevance ?? 'uncertain');
  const [comment, setComment] = useState(review?.comment ?? '');
  return <details className="field-review"><summary>Review passage: {review?.judgment.replaceAll('_', ' ') ?? 'not reviewed'}</summary>
    <div className="review-form">
      <label>Evidence judgment<select value={judgment} disabled={disabled} onChange={(event) => setJudgment(event.target.value as typeof judgment)}>
        {evidenceLabels.map((label) => <option key={label} value={label}>{label.replaceAll('_', ' ')}</option>)}</select></label>
      <label>Retrieval relevance<select value={relevance} disabled={disabled} onChange={(event) => setRelevance(event.target.value as typeof relevance)}>
        {relevanceLabels.map((label) => <option key={label} value={label}>{label.replaceAll('_', ' ')}</option>)}</select></label>
      <label className="review-comment">Reviewer comment<textarea value={comment} maxLength={1000} disabled={disabled} onChange={(event) => setComment(event.target.value)} /></label>
      <div className="review-actions"><button disabled={disabled} onClick={() => onSave({ controlId, passage, judgment, relevance, comment, updatedAt: new Date().toISOString() })}>Save evidence review</button>
        <button disabled={disabled || !review} onClick={() => { onSave(null); setJudgment('uncertain'); setRelevance('uncertain'); setComment(''); }}>Clear evidence review</button></div>
    </div></details>;
}

export function EvidenceExplorer({ summaryOnly = false, liveEnabled = false, isJudging = false, onRunningChange }: {
  summaryOnly?: boolean; liveEnabled?: boolean; isJudging?: boolean; onRunningChange: (running: boolean) => void;
}) {
  const [reviews, setReviews] = useState<EvidenceReview[]>([]);
  const [ready, setReady] = useState(false); const [error, setError] = useState('');
  const [controlId, setControlId] = useState(searchControls[0].id);
  const [systemId, setSystemId] = useState('dispatch'); const [showAll, setShowAll] = useState(false);
  const [strategy, setStrategy] = useState<'text' | 'graph'>('text');
  const [maxDepth, setMaxDepth] = useState(DEFAULT_GRAPH_LIMITS.maxDepth); const [includeArchived, setIncludeArchived] = useState(false);
  useEffect(() => { try { setReviews(readEvidenceReviews(localStorage)); } catch { setError('Evidence reviews could not be loaded. Export stored data before clearing or repairing browser storage.'); } setReady(true); }, []);
  const control = searchControls.find((entry) => entry.id === controlId)!;
  const graph = useMemo(() => buildEvidenceGraph(undefined, undefined, undefined, reviews), [reviews]);
  const search = useMemo(() => searchEvidenceGraph(graph, { ...DEFAULT_GRAPH_LIMITS, maxDepth, includeArchived, controlId, systemId }), [graph, maxDepth, includeArchived, controlId, systemId]);
  const snapshot = snapshotEvidenceSearch(graph, search, strategy, reviews);
  const sources = searchDocuments.filter((document) => {
    const revision = graph.nodes.find((node) => node.id === graphIds.revision(document.id, document.revision));
    return document.systemId === systemId && (includeArchived || (revision?.kind === 'revision' && revision.current === true));
  });
  const passages = searchPassages.filter((passage) => sources.some((document) => document.id === passage.documentId && document.revision === passage.revision));
  const candidates = strategy === 'graph' ? search.hits : search.baseline;
  const visible = showAll ? passages : candidates.map((entry) => entry.passage);
  const stats = summarizeEvidence(reviews);
  function save(passage: Passage, review: EvidenceReview | null) {
    try {
      const next = saveEvidenceReview(reviews, review, controlId, passage);
      writeEvidenceReviews(localStorage, next); setReviews(next);
    } catch { setError('Evidence review could not be saved. Stored reviews were not replaced; export them before leaving.'); }
  }
  function exportStored() {
    try { downloadJson('jev-evidence-storage.json', localStorage.getItem(EVIDENCE_KEY) ?? 'null'); }
    catch { setError('Browser storage is unavailable. No saved evidence data was changed.'); }
  }
  function importExperiment(runs: EvidenceRun[], nextReviews: EvidenceReview[]) {
    const beforeRuns = localStorage.getItem(EVIDENCE_RUNS_KEY), beforeReviews = localStorage.getItem(EVIDENCE_KEY);
    try { writeEvidenceRuns(localStorage, runs); writeEvidenceReviews(localStorage, nextReviews); }
    catch {
      try {
        if (beforeRuns === null) localStorage.removeItem(EVIDENCE_RUNS_KEY); else localStorage.setItem(EVIDENCE_RUNS_KEY, beforeRuns);
        if (beforeReviews === null) localStorage.removeItem(EVIDENCE_KEY); else localStorage.setItem(EVIDENCE_KEY, beforeReviews);
      } catch { setError('Import storage failed and rollback could not be completed. Export raw stored evidence and Jev runs before leaving.'); }
      throw new Error('Import could not be saved. No inference was made; inspect/export storage before retrying.');
    }
    setReviews(nextReviews);
  }
  return <section className="lab-view" aria-label={summaryOnly ? 'Evidence evaluation' : 'Governance Evidence Explorer'}>
    <div className="view-heading"><h2>{summaryOnly ? 'Evidence reviews' : 'Governance Evidence Explorer'}</h2>
      <button disabled={!ready || !!error} onClick={() => downloadJson('jev-evidence.json', JSON.stringify({ ...JSON.parse(exportEvidence(reviews)), search: snapshot }, null, 2))}>Export evidence + reviews</button></div>
    <p className="view-note">Synthetic documents · offline retrieval · human review and optional explicit Jev judgments. Relevant text does not establish legal compliance. No automatic Jev requests.</p>
    {error && <div role="alert" className="notice error">{error} <button onClick={exportStored}>Export stored evidence data</button></div>}
    <p className="view-note" aria-live="polite">Reviewed passage/control pairs: {stats.reviewed}. {evidenceLabels.map((label) => `${label.replaceAll('_', ' ')}: ${stats.counts[label]}`).join(' · ')}.</p>
    <p className="view-note">Text matcher across saved reviews: Retrieved {stats.retrievedRelevant} / {stats.relevant} manually marked relevant passages; missed {stats.missedRelevant}. This denominator covers reviewed passages only, not the full corpus. Retrieval quality is separate from classification agreement.</p>
    {!summaryOnly && <>
      <div className="comparison-selectors"><label>Governance control<select disabled={isJudging} value={controlId} onChange={(event) => setControlId(event.target.value)}>{searchControls.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>
        <label>Documented system<select disabled={isJudging} value={systemId} onChange={(event) => setSystemId(event.target.value)}>{[...new Set(searchDocuments.map((entry) => entry.systemId))].map((id) => <option key={id}>{id}</option>)}</select></label></div>
      <div className="comparison-selectors"><label>Search strategy<select disabled={isJudging} value={strategy} onChange={(event) => setStrategy(event.target.value as typeof strategy)}><option value="text">Text Search</option><option value="graph">Graph Search</option></select></label>
        {strategy === 'graph' && <label>Traversal depth<select disabled={isJudging} value={maxDepth} onChange={(event) => setMaxDepth(Number(event.target.value))}>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((depth) => <option key={depth}>{depth}</option>)}</select></label>}</div>
      <label><input type="checkbox" disabled={isJudging} checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Include archived revisions (pinned references are never upgraded)</label>
      <p><strong>Control statement:</strong> {control.statement}</p>
      <p className="view-note">{candidates.length} candidate passages / {passages.length} paragraphs from {sources.length} document revisions. Rank: distinct lexical matches descending, then graph hops ascending, then stable passage ID. This is not a probability or a finding.</p>
      <label><input type="checkbox" disabled={isJudging} checked={showAll} onChange={(event) => setShowAll(event.target.checked)} /> Inspect all source passages, including retrieval misses</label>
    </>}
    <p className="view-note" aria-live="polite">Search comparison for {systemId} / {control.title}, {includeArchived ? 'all pinned revisions' : 'current revisions'}: Text Search {search.baseline.length}; Graph Search {search.hits.length}. Reviewed relevant pool: text {snapshot.reviewedPool.text.retrievedRelevant}/{snapshot.reviewedPool.text.relevant}; graph {snapshot.reviewedPool.graph.retrievedRelevant}/{snapshot.reviewedPool.graph.relevant}. Human review edges are excluded from traversal.</p>
    {strategy === 'graph' && <><p className="view-note">Graph Search: {search.visited}/{search.query.maxVisited} visited nodes; {search.edgesExamined}/{search.query.maxEdges} examined edges; depth {maxDepth}; result cap {search.query.maxResults}. Limits reached: {search.limitsReached.join(', ') || 'none'}. Unreviewed links are retrieval leads, not verified relationships.</p>
      <details className="type-reference"><summary>Graph relationships and unresolved references ({search.diagnostics.length + search.excludedReferences.length})</summary>
        <p>{graph.nodes.length} nodes; {graph.edges.length} edges; {graph.edges.filter((edge) => edge.kind === 'human_review').length} human-review edges (not traversed).</p>
        {search.diagnostics.map((entry) => <p key={entry.id}>{entry.message} <code>{entry.target}</code> {entry.source && <span>Source: {entry.source.id} / {entry.source.section}</span>}</p>)}
        {search.excludedReferences.map((entry) => <p key={entry.edgeId}>{entry.reason} <code>{entry.edgeId}</code></p>)}
      </details></>}
    <p className="view-note">For independent reference labels, review and export all six cases before making Jev requests. Saved predictions remain visible; this is not a blinded review interface.</p>
    <p className="view-note">Jev judgments remain limited to the fixed six cases; newly added register revisions can be reviewed by a human. Search never calls Jev.</p>
    <EvidenceJudgments reviews={reviews} reviewsAvailable={ready && !error} passages={visible} controlId={controlId} liveEnabled={liveEnabled && !error} summaryOnly={summaryOnly} onRunningChange={onRunningChange} search={snapshot} onImport={importExperiment} />
    {!summaryOnly && <>
      {!visible.length && <p className="empty-results">No candidate passages. Inspect all source passages to review missing information or retrieval misses.</p>}
      {visible.map((passage) => {
        const document = sources.find((entry) => entry.id === passage.documentId && entry.revision === passage.revision)!;
        const match = candidates.find((entry) => entry.passage.id === passage.id);
        const review = reviews.find((entry) => entry.controlId === controlId && entry.passage.id === passage.id);
        return <article className="evidence-passage" key={passage.id} aria-label={`${document.title} / ${passage.section}`}>
          <h3>{document.title}</h3><p className="view-note">{passage.section} · revision {passage.revision} · lines {passage.startLine}–{passage.endLine} · UTF-16 offsets [{passage.start}, {passage.end})</p>
          <code className="evidence-source">{passage.id}</code><blockquote className="comparison-description">{passage.text}</blockquote>
          <p className="view-note">{match ? `Matched terms: ${match.matchedTerms.join(', ') || 'none; structural candidate'}` : 'Not selected by the current search strategy.'}</p>
          {strategy === 'graph' && match && <SearchReason hit={match} graph={graph} />}
          <PassageReview key={`${controlId}:${passage.id}`} passage={passage} controlId={controlId} review={review} disabled={!ready || !!error} onSave={(value) => save(passage, value)} />
        </article>;
      })}
      <details className="type-reference"><summary>Full source documents</summary>{sources.map((document) => <section key={`${document.id}@${document.revision}`}><h3>{document.title} · {document.id}@{document.revision}</h3><pre className="comparison-description">{document.content}</pre></section>)}</details>
      <p className="view-note">Fixed dataset {DATASET_VERSION}; additive search corpus {SEARCH_DATASET_VERSION}. System IDs are explicit synthetic identifiers, not inferred entity alignment. Reviews stay in this browser; export before changing origins.</p>
    </>}
  </section>;
}
