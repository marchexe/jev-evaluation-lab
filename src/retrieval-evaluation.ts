import { createHash } from 'node:crypto';
import { buildEvidenceGraph, searchEvidenceGraph, graphManifest, DEFAULT_GRAPH_LIMITS, GRAPH_VERSION, GRAPH_SEARCH_VERSION,
  type GraphQuery, type GraphHit, type GraphManifest } from './ui/evidence-graph';
import { searchDocuments, searchControls, segmentDocument, SEARCH_DATASET_VERSION,
  type EvidenceDocument, type EvidenceControl, type Passage } from './ui/evidence';

export const IMPLEMENTATION_FILES = ['src/ui/evidence.ts', 'src/ui/evidence-graph.ts', 'src/retrieval-evaluation.ts', 'scripts/evaluate-retrieval.ts', 'package-lock.json'];
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  throw new Error('Cannot hash non-JSON data.');
}
export const hashJson = (value: unknown) => `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
export const hashSource = (text: string) => `sha256:${createHash('sha256').update(text.replace(/\r\n?/g, '\n'), 'utf8').digest('hex')}`;
function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export type QueryDefinition = { id: string; systemId: string; controlId: string; includeArchived: boolean; queryText: string; lexicalTerms: string[] | null; coverage: string[] };
export type RetrievalCase = Omit<QueryDefinition, 'lexicalTerms'> & { lexicalTerms: string[]; query: GraphQuery; eligiblePassageIds: string[] };
type Rules = { version: string; k: number; [key: string]: unknown };
type ManifestPayload = { id: string; corpusVersion: string; documents: EvidenceDocument[]; controls: EvidenceControl[]; passages: Passage[];
  graphConfiguration: GraphManifest; cases: RetrievalCase[]; rules: Rules; software: { nodeMajor: number; files: Record<string, string>; graphVersion: string; searchVersion: string } };
export type RetrievalManifest = { schemaVersion: 1; payload: ManifestPayload; hashes: Record<string, string> };

function eligiblePool(payload: Pick<ManifestPayload, 'documents' | 'passages' | 'graphConfiguration'>, query: GraphQuery) {
  return payload.passages.filter((passage) => {
    if (passage.systemId !== query.systemId) return false;
    if (query.includeArchived) return true;
    const revisions = payload.documents.filter((document) => document.id === passage.documentId);
    const current = payload.graphConfiguration.currentRevisions[passage.documentId] ?? (revisions.length === 1 ? revisions[0].revision : null);
    return current === passage.revision;
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function manifestHashes(payload: ManifestPayload) {
  const hashes = {
    corpus: hashJson({ version: payload.corpusVersion, documents: payload.documents, passages: payload.passages, controls: payload.controls }),
    relations: hashJson(payload.graphConfiguration), queries: hashJson(payload.cases), rules: hashJson(payload.rules), software: hashJson(payload.software),
  };
  return { ...hashes, experiment: hashJson({ schemaVersion: 1, id: payload.id, ...hashes }) };
}
export function prepareRetrievalManifest(definition: { id: string; cases: QueryDefinition[] }, rules: Rules, files: Record<string, string>): RetrievalManifest {
  const snapshot = structuredClone({ documents: searchDocuments, controls: searchControls, graphConfiguration: graphManifest });
  const passages = snapshot.documents.flatMap(segmentDocument);
  const cases = definition.cases.map((entry): RetrievalCase => {
    const control = snapshot.controls.find((control) => control.id === entry.controlId);
    requireValue(control, 'Unknown evaluation control.');
    const query = { ...DEFAULT_GRAPH_LIMITS, systemId: entry.systemId, controlId: entry.controlId, includeArchived: entry.includeArchived };
    return { ...entry, lexicalTerms: entry.lexicalTerms ?? control.terms, query,
      eligiblePassageIds: eligiblePool({ ...snapshot, passages }, query).map((passage) => passage.id) };
  });
  const payload: ManifestPayload = { ...snapshot, passages, cases, id: definition.id, corpusVersion: SEARCH_DATASET_VERSION, rules,
    software: { nodeMajor: 24, files, graphVersion: GRAPH_VERSION, searchVersion: GRAPH_SEARCH_VERSION } };
  const manifest: RetrievalManifest = { schemaVersion: 1, payload, hashes: manifestHashes(payload) };
  validateRetrievalManifest(manifest); return manifest;
}
export function validateRetrievalManifest(manifest: RetrievalManifest) {
  requireValue(manifest?.schemaVersion === 1 && manifest.payload && manifest.hashes, 'Invalid frozen manifest.');
  const payload = manifest.payload;
  requireValue(canonicalJson(manifest.hashes) === canonicalJson(manifestHashes(payload)), 'Frozen experiment hash mismatch.');
  requireValue(payload.rules.k === 5, 'This protocol requires k=5.');
  requireValue(canonicalJson(payload.passages) === canonicalJson(payload.documents.flatMap(segmentDocument)), 'Frozen passage provenance differs from source documents.');
  requireValue(new Set(payload.cases.map((entry) => entry.id)).size === payload.cases.length, 'Duplicate evaluation case ID.');
  const graph = buildEvidenceGraph(payload.documents, payload.controls, payload.graphConfiguration);
  for (const entry of payload.cases) {
    requireValue(/^[a-z0-9][a-z0-9-]*$/.test(entry.id), 'Unsafe evaluation case ID.');
    requireValue(typeof entry.queryText === 'string' && !!entry.queryText.trim() && entry.lexicalTerms.length > 0
      && entry.lexicalTerms.every((term) => typeof term === 'string' && !!term.trim()) && new Set(entry.lexicalTerms).size === entry.lexicalTerms.length, 'Invalid query terms/text.');
    requireValue(entry.systemId === entry.query.systemId && entry.controlId === entry.query.controlId && entry.includeArchived === entry.query.includeArchived, 'Query scope mismatch.');
    requireValue(canonicalJson(entry.eligiblePassageIds) === canonicalJson(eligiblePool(payload, entry.query).map((passage) => passage.id)), 'Eligible pool must cover every in-scope passage.');
    searchEvidenceGraph(graph, entry.query); // Validate limits/known identities; results never determine the label pool.
  }
}

export type RelevanceLabel = { passage: Passage; label: 'relevant' | 'not_relevant' | 'uncertain' | null; confirmed: boolean; comment: string };
export type RelevancePacket = { schemaVersion: 1; experimentHash: string; instructions: { relevance: unknown; independence: unknown };
  confirmation: { reviewerAlias: string; confirmedAt: string | null; independentReview: boolean };
  cases: { caseId: string; context: { queryText: string; systemId: string; control: EvidenceControl; includeArchived: boolean }; judgments: RelevanceLabel[] }[] };
function reviewContext(payload: ManifestPayload, entry: RetrievalCase) {
  const control = payload.controls.find((control) => control.id === entry.controlId)!;
  return { queryText: entry.queryText, systemId: entry.systemId, control: { ...control, terms: entry.lexicalTerms }, includeArchived: entry.includeArchived };
}
export function createRelevanceTemplate(manifest: RetrievalManifest): RelevancePacket {
  validateRetrievalManifest(manifest);
  return { schemaVersion: 1, experimentHash: manifest.hashes.experiment,
    instructions: { relevance: manifest.payload.rules.relevanceDefinition, independence: manifest.payload.rules.independence },
    confirmation: { reviewerAlias: '', confirmedAt: null, independentReview: false },
    cases: manifest.payload.cases.map((entry) => ({ caseId: entry.id, context: reviewContext(manifest.payload, entry),
      judgments: eligiblePool(manifest.payload, entry.query).map((passage) => ({ passage: structuredClone(passage), label: null, confirmed: false, comment: '' })) })) };
}
export function validateRelevancePacket(manifest: RetrievalManifest, packet: RelevancePacket) {
  requireValue(packet?.schemaVersion === 1 && packet.experimentHash === manifest.hashes.experiment && Array.isArray(packet.cases), 'Reference packet belongs to a different experiment.');
  requireValue(canonicalJson(packet.instructions) === canonicalJson({ relevance: manifest.payload.rules.relevanceDefinition, independence: manifest.payload.rules.independence }), 'Frozen review instructions were changed.');
  requireValue(packet.cases.length === manifest.payload.cases.length && new Set(packet.cases.map((entry) => entry.caseId)).size === packet.cases.length, 'Missing or duplicate review cases.');
  requireValue(typeof packet.confirmation?.independentReview === 'boolean' && typeof packet.confirmation.reviewerAlias === 'string'
    && (packet.confirmation.confirmedAt === null || typeof packet.confirmation.confirmedAt === 'string'), 'Invalid human confirmation metadata.');
  for (const entry of manifest.payload.cases) {
    const item = packet.cases.find((item) => item.caseId === entry.id);
    requireValue(item && canonicalJson(item.context) === canonicalJson(reviewContext(manifest.payload, entry)), 'Review query/control was changed.');
    requireValue(Array.isArray(item.judgments) && item.judgments.length === entry.eligiblePassageIds.length
      && new Set(item.judgments.map((row) => row.passage?.id)).size === item.judgments.length, 'Review template must cover the entire eligible pool exactly once.');
    for (const row of item.judgments) {
      const passage = manifest.payload.passages.find((passage) => passage.id === row.passage?.id);
      requireValue(passage && entry.eligiblePassageIds.includes(passage.id) && canonicalJson(passage) === canonicalJson(row.passage), 'Review source is changed or outside the eligible pool.');
      requireValue([null, 'relevant', 'not_relevant', 'uncertain'].includes(row.label) && typeof row.confirmed === 'boolean'
        && typeof row.comment === 'string' && row.comment.length <= 2000, 'Invalid relevance judgment.');
    }
  }
}
export type FrozenRelevanceReference = { schemaVersion: 1; experimentHash: string; labelsHash: string; referenceHash: string; labels: RelevancePacket };
export function freezeRelevanceReference(manifest: RetrievalManifest, packet: RelevancePacket): FrozenRelevanceReference {
  validateRetrievalManifest(manifest); validateRelevancePacket(manifest, packet);
  const confirmation = packet.confirmation;
  requireValue(confirmation.independentReview === true && !!confirmation.reviewerAlias.trim()
    && confirmation.confirmedAt && Number.isFinite(Date.parse(confirmation.confirmedAt)), 'A named/aliased human must attest independent review and supply a confirmation date.');
  const rows = packet.cases.flatMap((entry) => entry.judgments);
  requireValue(rows.every((row) => row.confirmed && row.label !== null), 'Every eligible query/passage pair must be human-confirmed before freezing. Uncertain is allowed but excludes the query from relevance metrics.');
  const labelsHash = hashJson(packet); const identity = { schemaVersion: 1 as const, experimentHash: manifest.hashes.experiment, labelsHash };
  return { ...identity, referenceHash: hashJson(identity), labels: structuredClone(packet) };
}
export function validateFrozenReference(manifest: RetrievalManifest, reference: FrozenRelevanceReference) {
  requireValue(reference?.schemaVersion === 1 && reference.labels, 'Invalid frozen human reference.');
  const expected = freezeRelevanceReference(manifest, reference.labels);
  requireValue(reference.schemaVersion === 1 && reference.experimentHash === expected.experimentHash
    && reference.labelsHash === expected.labelsHash && reference.referenceHash === expected.referenceHash, 'Frozen human reference hash mismatch.');
}

/** Categorical ID arithmetic only. Real experiment references must pass the human freeze gate. */
export function scoreRetrieval(ids: string[], rows: RelevanceLabel[], enabled: boolean) {
  const k = 5;
  requireValue(new Set(ids).size === ids.length && ids.every((id) => rows.some((row) => row.passage.id === id)), 'Retrieved IDs must be unique and inside the judged eligible pool.');
  const known = enabled ? rows.filter((row) => row.confirmed && (row.label === 'relevant' || row.label === 'not_relevant')) : [];
  const knownIds = new Set(known.map((row) => row.passage.id));
  const relevantIds = known.filter((row) => row.label === 'relevant').map((row) => row.passage.id);
  const irrelevantIds = new Set(known.filter((row) => row.label === 'not_relevant').map((row) => row.passage.id));
  const complete = enabled && known.length === rows.length;
  const top = ids.slice(0, k); const relevantAtK = top.filter((id) => relevantIds.includes(id));
  const positive = complete && relevantIds.length > 0;
  return { status: !enabled ? 'awaiting_frozen_human_reference' : !complete ? 'incomplete_judgments' : positive ? 'scored' : 'zero_relevant',
    k, eligibleCount: rows.length, confirmedBinaryCount: known.length, unresolvedCount: rows.length - known.length,
    referenceComplete: complete, relevantPassageIds: relevantIds, unresolvedPassageIds: rows.filter((row) => !knownIds.has(row.passage.id)).map((row) => row.passage.id),
    returnedCount: ids.length, topIds: top, relevantAtKIds: relevantAtK,
    missedRelevantAtKIds: relevantIds.filter((id) => !top.includes(id)), missedRelevantFullIds: relevantIds.filter((id) => !ids.includes(id)),
    irrelevantAtKIds: top.filter((id) => irrelevantIds.has(id)), irrelevantFullIds: ids.filter((id) => irrelevantIds.has(id)),
    unjudgedReturnedIds: ids.filter((id) => !knownIds.has(id)),
    precisionAt5: positive ? relevantAtK.length / k : null, precisionDenominator: positive ? k : null,
    recallAt5: positive ? relevantAtK.length / relevantIds.length : null, recallDenominator: complete ? relevantIds.length : null,
    noAnswer: { reference: !complete ? 'unknown' : positive ? 'has_relevant' : 'zero_relevant', returnedEmpty: ids.length === 0,
      correctEmptyReturn: complete && !positive ? ids.length === 0 : null } };
}

function summarizePair(cases: { id: string; text: ReturnType<typeof scoreRetrieval>; graph: ReturnType<typeof scoreRetrieval> }[]) {
  const eligible = cases.filter((entry) => entry.text.status === 'scored' && entry.graph.status === 'scored');
  const zero = cases.filter((entry) => entry.text.status === 'zero_relevant');
  const strategy = (name: 'text' | 'graph') => {
    const tp = eligible.reduce((sum, entry) => sum + entry[name].relevantAtKIds.length, 0);
    const relevant = eligible.reduce((sum, entry) => sum + entry[name].relevantPassageIds.length, 0);
    return { macroPrecisionAt5: eligible.length ? eligible.reduce((sum, entry) => sum + entry[name].precisionAt5!, 0) / eligible.length : null,
      macroRecallAt5: eligible.length ? eligible.reduce((sum, entry) => sum + entry[name].recallAt5!, 0) / eligible.length : null,
      microPrecisionAt5: eligible.length ? tp / (5 * eligible.length) : null, microPrecisionDenominator: 5 * eligible.length,
      microRecallAt5: relevant ? tp / relevant : null, microRecallDenominator: relevant, relevantRetrievedAt5: tp,
      noAnswerCorrectEmpty: zero.filter((entry) => entry[name].noAnswer.correctEmptyReturn).length };
  };
  return { positiveQueryCount: eligible.length, positiveQueryIds: eligible.map((entry) => entry.id), zeroRelevantQueryCount: zero.length, zeroRelevantQueryIds: zero.map((entry) => entry.id),
    incompleteQueryIds: cases.filter((entry) => !entry.text.referenceComplete).map((entry) => entry.id), text: strategy('text'), graph: strategy('graph') };
}

export function runRetrievalEvaluation(manifest: RetrievalManifest, options: { labels?: RelevancePacket; reference?: FrozenRelevanceReference } = {}) {
  validateRetrievalManifest(manifest);
  requireValue(!(options.labels && options.reference), 'Use a draft label packet or a frozen reference, not both.');
  if (options.reference) validateFrozenReference(manifest, options.reference);
  const labels = options.reference?.labels ?? options.labels ?? createRelevanceTemplate(manifest);
  validateRelevancePacket(manifest, labels);
  const measured = !!options.reference;
  const payload = manifest.payload;
  const catalog = buildEvidenceGraph(payload.documents, payload.controls, payload.graphConfiguration);
  const compact = (hits: GraphHit[]) => hits.map((hit, index) => ({ rank: index + 1, passageId: hit.passage.id, matchedTerms: hit.matchedTerms, path: hit.path }));
  function execute(entry: RetrievalCase, curated = true, depth = entry.query.maxDepth) {
    const controls = payload.controls.map((control) => control.id === entry.controlId ? { ...control, terms: entry.lexicalTerms } : control);
    const configuration = curated ? payload.graphConfiguration : { ...payload.graphConfiguration, relationships: [] };
    const graph = buildEvidenceGraph(payload.documents, controls, configuration);
    return searchEvidenceGraph(graph, { ...entry.query, maxDepth: depth });
  }
  const cases = payload.cases.map((entry) => {
    const result = execute(entry); const counterfactual = execute(entry, false);
    const rows = labels.cases.find((item) => item.caseId === entry.id)!.judgments;
    const textIds = result.baseline.map((hit) => hit.passage.id); const graphIds = result.hits.map((hit) => hit.passage.id);
    const noCuratedIds = counterfactual.hits.map((hit) => hit.passage.id);
    const selectedControl = payload.controls.find((control) => control.id === entry.controlId)!;
    return { id: entry.id, queryText: entry.queryText, control: { ...selectedControl, terms: entry.lexicalTerms }, query: entry.query,
      coverage: entry.coverage, eligiblePassageIds: entry.eligiblePassageIds,
      text: scoreRetrieval(textIds, rows, measured), graph: scoreRetrieval(graphIds, rows, measured),
      textResults: compact(result.baseline), graphResults: compact(result.hits),
      different: canonicalJson(textIds) !== canonicalJson(graphIds), graphOnlyIds: graphIds.filter((id) => !textIds.includes(id)), textOnlyIds: textIds.filter((id) => !graphIds.includes(id)),
      diagnostics: result.diagnostics, excludedReferences: result.excludedReferences,
      execution: { graph: { visited: result.visited, edgesExamined: result.edgesExamined, limitsReached: result.limitsReached, limits: result.query },
        text: { algorithm: 'term-match-1', eligiblePassagesScanned: entry.eligiblePassageIds.length, visitedNodes: null, examinedEdges: null, limitsReached: [] } },
      curatedAblation: { removed: 'All curated manifest relationships; pinned source links and revision selections retained.', resultIds: noCuratedIds,
        absentWithoutCuratedIds: graphIds.filter((id) => !noCuratedIds.includes(id)), addedWithoutCuratedIds: noCuratedIds.filter((id) => !graphIds.includes(id)),
        pathUsesCuratedEdgeIds: [...new Set(result.hits.flatMap((hit) => hit.path.steps.map((step) => step.edgeId)).filter((id) => catalog.edges.some((edge) => edge.id === id && ['related_control', 'control_section'].includes(edge.kind))))],
        visited: counterfactual.visited, edgesExamined: counterfactual.edgesExamined, limitsReached: counterfactual.limitsReached } };
  });
  const ablationCase = payload.cases.find((entry) => entry.id === 'retrieval-001');
  requireValue(ablationCase, 'The fixed five-hop ablation case is missing.');
  const probeId = 'dispatch-signoff@1:34-107';
  requireValue(ablationCase.eligiblePassageIds.includes(probeId), 'Five-hop probe source is missing.');
  const depthAblation = [4, 5].map((depth) => {
    const result = execute(ablationCase, true, depth); const ids = result.hits.map((hit) => hit.passage.id);
    const rows = labels.cases.find((entry) => entry.caseId === ablationCase.id)!.judgments;
    return { depth, probePassageId: probeId, probeRank: ids.includes(probeId) ? ids.indexOf(probeId) + 1 : null, probeInTop5: ids.slice(0, 5).includes(probeId),
      results: compact(result.hits), metrics: scoreRetrieval(ids, rows, measured), visited: result.visited, edgesExamined: result.edgesExamined, limitsReached: result.limitsReached };
  });
  const allRows = labels.cases.flatMap((entry) => entry.judgments);
  return { schemaVersion: 1, experimentId: payload.id, experimentHash: manifest.hashes.experiment,
    referenceStatus: measured ? 'frozen_human_reference' : 'awaiting_human_confirmation', referenceHash: options.reference?.referenceHash ?? null,
    labelsHash: hashJson(labels), judgments: { total: allRows.length, unconfirmed: allRows.filter((row) => !row.confirmed || row.label === null).length,
      uncertain: allRows.filter((row) => row.label === 'uncertain').length, metricsEnabled: measured },
    rules: payload.rules, aggregate: summarizePair(cases), differences: cases.filter((entry) => entry.different).map((entry) => entry.id),
    exhaustedQueryIds: cases.filter((entry) => entry.execution.graph.limitsReached.length > 0).map((entry) => entry.id),
    passageCatalog: payload.passages, graphCatalog: catalog, cases, depthAblation,
    limitations: ['Related synthetic query variants are not independent population samples.', 'Curated relationships can determine candidate expansion; extra candidates do not prove superiority.',
      'No Jev inference, evidence-classification metrics, legal verdict, or generated relevance labels.', 'The application ranking is unchanged; full-list retrieval and top-five metrics are distinct.',
      'Human confirmation is an attestation, not cryptographic proof of who reviewed or what they saw.'] };
}

export type RetrievalReport = ReturnType<typeof runRetrievalEvaluation>;
const md = (value: unknown) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const metric = (value: number | null) => value === null ? 'unavailable' : String(value);
export function renderRetrievalReport(report: RetrievalReport) {
  return [`# Retrieval experiment: ${report.experimentId}`, '', `Status: **${report.referenceStatus}**.`, `Experiment: \`${report.experimentHash}\``,
    `Human reference: ${report.referenceHash ? `\`${report.referenceHash}\`` : 'not frozen; relevance metrics are withheld'}.`, '',
    `${report.cases.length} query configurations; ${report.judgments.total} eligible query/passage pairs; ${report.judgments.unconfirmed} unconfirmed; ${report.judgments.uncertain} uncertain.`,
    'The label template covers full eligible pools and contains no ranking-derived labels. Review it before inspecting results.', '',
    `Paired positive-reference metric sample: ${report.aggregate.positiveQueryCount} queries. Zero-reference sample: ${report.aggregate.zeroRelevantQueryCount}. Incomplete/unmeasured queries: ${report.aggregate.incompleteQueryIds.length}.`, '',
    '| Strategy | Macro Precision@5 | Macro Recall@5 | Micro precision denominator | Micro recall denominator | Correct empty no-answer returns |',
    '| --- | --- | --- | --- | --- | --- |', ...(['text', 'graph'] as const).map((name) => { const value = report.aggregate[name]; return `| ${name} | ${metric(value.macroPrecisionAt5)} | ${metric(value.macroRecallAt5)} | ${value.microPrecisionDenominator} | ${value.microRecallDenominator} | ${value.noAnswerCorrectEmpty}/${report.aggregate.zeroRelevantQueryCount} |`; }), '',
    'Precision uses five slots even for short result lists. Zero-reference queries have null precision/recall and a separate empty-return check. Any unresolved eligible judgment excludes the query from relevance metrics.', '',
    '| Query | Text results | Graph results | Text P@5 / R@5 | Graph P@5 / R@5 | Confirmed binary / pool | Limits |',
    '| --- | --- | --- | --- | --- | --- | --- |', ...report.cases.map((entry) => `| [${entry.id}](cases/${entry.id}.md) | ${entry.text.returnedCount} | ${entry.graph.returnedCount} | ${metric(entry.text.precisionAt5)} / ${metric(entry.text.recallAt5)} | ${metric(entry.graph.precisionAt5)} / ${metric(entry.graph.recallAt5)} | ${entry.text.confirmedBinaryCount}/${entry.text.eligibleCount} | ${md(entry.execution.graph.limitsReached.join(', ') || 'none')} |`), '',
    `Strategies differ on ${report.differences.length}/${report.cases.length} configurations. These are observed result differences, not measured errors unless references are complete.`, '',
    '## Depth ablation: retrieval-001', '', '| Depth | Probe full-list rank | Probe in top five | Graph results | Limits |', '| --- | --- | --- | --- | --- |',
    ...report.depthAblation.map((entry) => `| ${entry.depth} | ${entry.probeRank ?? 'absent'} | ${entry.probeInTop5} | ${entry.results.length} | ${entry.limitsReached.join(', ') || 'none'} |`), '',
    'The queue passage becoming reachable at depth five does not establish a Recall@5 improvement. See the recorded rank and human-reference status.', '',
    '## Reproduction and interpretation', '', 'Use the adjacent manifest.json and reference-labels.json (or frozen-reference.json) with the documented eval:retrieval run command. Each case file contains source excerpts, exact settings, result lists, diagnostics, and edge provenance. results.json is the machine-readable report.', '',
    ...report.limitations.map((line) => `- ${line}`), ''].join('\n');
}

export function renderRetrievalCase(report: RetrievalReport, entry: RetrievalReport['cases'][number]) {
  const passages = new Map(report.passageCatalog.map((passage) => [passage.id, passage]));
  const edges = new Map(report.graphCatalog.edges.map((edge) => [edge.id, edge]));
  const list = (ids: string[]) => ids.length ? ids.map((id) => `\`${id}\``).join(', ') : '(none known)';
  const resultLines = (hits: typeof entry.graphResults) => hits.map((hit) => `${hit.rank}. \`${hit.passageId}\` — ${hit.matchedTerms.length} lexical matches; ${hit.path.steps.length} hops.`);
  const sourceIds = [...new Set([...entry.textResults.map((hit) => hit.passageId), ...entry.graphResults.map((hit) => hit.passageId), ...entry.text.relevantPassageIds])];
  return [`# ${entry.id}`, '', entry.queryText, '', `Control: **${md(entry.control.title)}** (\`${entry.control.id}\`): ${entry.control.statement}`, '',
    `Query configuration: \`${canonicalJson({ ...entry.query, lexicalTerms: entry.control.terms })}\``, '', `Reference status: ${entry.text.status}; ${entry.text.confirmedBinaryCount}/${entry.text.eligibleCount} binary-confirmed eligible judgments.`,
    `Known relevant IDs: ${list(entry.text.relevantPassageIds)}`, `Unresolved eligible IDs: ${list(entry.text.unresolvedPassageIds)}`, '',
    '## Text Search', '', ...resultLines(entry.textResults), '', '## Graph Search', '', ...resultLines(entry.graphResults), '',
    ...(['text', 'graph'] as const).flatMap((name) => [`## ${name} reference-based analysis`, '', `Precision@5: ${metric(entry[name].precisionAt5)}; denominator: ${entry[name].precisionDenominator ?? 'unavailable'}. Recall@5: ${metric(entry[name].recallAt5)}; denominator: ${entry[name].recallDenominator ?? 'unavailable'}.`,
      `Known relevant missed at five: ${list(entry[name].missedRelevantAtKIds)}`, `Known relevant missed in the full list: ${list(entry[name].missedRelevantFullIds)}`,
      `Known irrelevant at five: ${list(entry[name].irrelevantAtKIds)}`, `Known irrelevant in the full list: ${list(entry[name].irrelevantFullIds)}`, `Unjudged returned: ${list(entry[name].unjudgedReturnedIds)}`,
      `No-answer behavior: \`${canonicalJson(entry[name].noAnswer)}\``, '']),
    '## Differences and curated-link ablation', '', `Graph-only IDs: ${list(entry.graphOnlyIds)}`, `Text-only IDs: ${list(entry.textOnlyIds)}`,
    `Absent without curated relationships: ${list(entry.curatedAblation.absentWithoutCuratedIds)}`, `Returned without curated relationships: ${list(entry.curatedAblation.resultIds)}`,
    `Counterfactual limits: ${entry.curatedAblation.limitsReached.join(', ') || 'none'}. Curated edges used: ${list(entry.curatedAblation.pathUsesCuratedEdgeIds)}`, '',
    '## Exact returned/relevant sources and graph paths', '', ...sourceIds.flatMap((id) => {
      const passage = passages.get(id)!; const hit = entry.graphResults.find((hit) => hit.passageId === id);
      return [`### ${id}`, '', `${passage.documentId}@${passage.revision} / ${passage.section}; lines ${passage.startLine}–${passage.endLine}; UTF-16 [${passage.start},${passage.end}).`, '',
        ...passage.text.split('\n').map((line) => `> ${line}`), '', hit ? `Seed: ${hit.path.seed.kind}; node path: \`${hit.path.nodeIds.join(' → ')}\`.` : 'No Graph Search result path for this passage.',
        ...(hit?.path.steps ?? []).flatMap((step) => { const edge = edges.get(step.edgeId)!; const source = edge.provenance;
          return [`- \`${edge.id}\` (${step.direction}); ${edge.kind}; ${edge.origin}; ${edge.reviewStatus}.`,
            ...(source.kind === 'source' ? [`  Source: ${source.passage.documentId}@${source.passage.revision} / ${source.passage.section}; lines ${source.passage.startLine}–${source.passage.endLine}; UTF-16 [${source.passage.start},${source.passage.end}).`, `  Quote: ${md(source.quote)}`] : [])]; }), ''];
    }), '## Diagnostics and bounded execution', '', '```json', JSON.stringify({ diagnostics: entry.diagnostics, excludedReferences: entry.excludedReferences, execution: entry.execution }, null, 2), '```', ''].join('\n');
}
