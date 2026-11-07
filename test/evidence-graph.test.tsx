import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEvidenceGraph, searchEvidenceGraph, snapshotEvidenceSearch, summarizeSearchPool, graphIds, graphManifest, DEFAULT_GRAPH_LIMITS,
  type EvidenceGraph, type GraphQuery } from '../src/ui/evidence-graph';
import { searchDocuments, searchControls, searchPassages, evidenceDocuments, evidencePassages, retrievePassages,
  saveEvidenceReview, writeEvidenceReviews, readEvidenceReviews, EVIDENCE_KEY, DATASET_VERSION, type EvidenceReview } from '../src/ui/evidence';
import { exportEvidenceExperiment } from '../src/ui/evidence-runs';

const query: GraphQuery = { ...DEFAULT_GRAPH_LIMITS, systemId: 'dispatch', controlId: 'human-oversight', includeArchived: false };
const graph = buildEvidenceGraph();
const signoff = evidencePassages.find((passage) => passage.documentId === 'dispatch-signoff' && passage.section.endsWith('Final gate'))!;
const hitIds = (result: ReturnType<typeof searchEvidenceGraph>) => result.hits.map((hit) => hit.passage.id);

test('graph identities, typed endpoints and exact provenance are stable across input order', () => {
  assert.deepEqual(buildEvidenceGraph([...searchDocuments].reverse(), [...searchControls].reverse()), graph);
  assert.equal(new Set(graph.nodes.map((node) => node.id)).size, graph.nodes.length);
  assert.equal(new Set(graph.edges.map((edge) => edge.id)).size, graph.edges.length);
  assert.deepEqual([...new Set(graph.nodes.map((node) => node.kind))].sort(), ['control', 'document', 'passage', 'revision', 'section', 'system']);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const endpoints = { system_document: ['system', 'document'], document_revision: ['document', 'revision'], revision_section: ['revision', 'section'],
    section_passage: ['section', 'passage'], related_control: ['control', 'control'], control_section: ['control', 'section'],
    references: ['passage', 'section'], supersedes: ['revision', 'revision'], human_review: ['control', 'passage'] };
  for (const edge of graph.edges) {
    assert.deepEqual([nodes.get(edge.from)!.kind, nodes.get(edge.to)!.kind], endpoints[edge.kind]);
    assert.equal(edge.reviewStatus, 'unreviewed');
    if (edge.provenance.kind === 'source') {
      const { passage, quote } = edge.provenance;
      const document = searchDocuments.find((entry) => entry.id === passage.documentId && entry.revision === passage.revision)!;
      assert.equal(document.content.slice(passage.start, passage.end), passage.text);
      assert.ok(passage.text.includes(quote));
      assert.equal(document.content.slice(0, passage.start).split('\n').length, passage.startLine);
    }
  }
  assert.throws(() => buildEvidenceGraph([...searchDocuments, { ...searchDocuments[0], content: 'Changed content under the same revision' }]), /Duplicate immutable revision/);
});

test('five-hop traversal retrieves the exact lexical miss through a quoted control alias and pinned document reference', () => {
  const result = searchEvidenceGraph(graph, query);
  assert.equal(result.baseline.length, 4); assert.equal(result.hits.length, 7);
  assert.ok(!result.baseline.some((hit) => hit.passage.id === signoff.id));
  const found = result.hits.find((hit) => hit.passage.id === signoff.id)!;
  assert.deepEqual(found.passage, signoff); assert.deepEqual(found.matchedTerms, []);
  assert.equal(found.path.seed.kind, 'control'); assert.equal(found.path.steps.length, 5);
  assert.deepEqual(found.path.steps.map((step) => graph.edges.find((edge) => edge.id === step.edgeId)!.kind),
    ['related_control', 'control_section', 'section_passage', 'references', 'section_passage']);
  assert.equal(graph.nodes.find((node) => node.id === found.path.nodeIds[1])!.kind, 'control');
  assert.ok(!hitIds(searchEvidenceGraph(graph, { ...query, maxDepth: 4 })).includes(signoff.id));
  const noLinks = buildEvidenceGraph(undefined, undefined, { ...graphManifest, relationships: [] });
  assert.ok(!hitIds(searchEvidenceGraph(noLinks, query)).includes(signoff.id));
});

test('text baseline is the unchanged retriever on the same revision-scoped corpus; graph ranks deterministically without hiding distractors', () => {
  const result = searchEvidenceGraph(graph, query);
  const currentPassages = searchPassages.filter((passage) => passage.systemId === query.systemId
    && (passage.documentId !== 'dispatch-gates' || passage.revision === '2'));
  assert.deepEqual(result.baseline.map(({ passage, matchedTerms }) => ({ passage, matchedTerms })), retrievePassages(currentPassages, searchControls[0]));
  assert.deepEqual(result.hits.slice(0, result.baseline.length).map((hit) => hit.passage.id), result.baseline.map((hit) => hit.passage.id));
  assert.deepEqual(searchEvidenceGraph(graph, query), result);
  assert.ok(result.hits.some((hit) => hit.passage.documentId === 'dispatch-editorial'));
  assert.ok(result.hits.some((hit) => hit.passage.documentId === 'dispatch-policy'));
  assert.ok(result.hits.some((hit) => hit.passage.documentId === 'dispatch-runbook'));
  const rootless = searchEvidenceGraph(graph, { ...query, maxDepth: 0 });
  assert.deepEqual(hitIds(rootless), result.baseline.map((hit) => hit.passage.id));
});

test('lexical seeds also expand through exact references without a curated control path or blanket document expansion', () => {
  const source = { id: 'pointer', revision: '1', systemId: 'dispatch', title: 'Synthetic pointer',
    content: '# Source log\n\n## Pointer\n\nFor human oversight, consult [Queue gate](evidence:dispatch-signoff@1#Queue%20procedure%20%2F%20Final%20gate).' };
  const unrelated = { id: 'isolated', revision: '1', systemId: 'dispatch', title: 'Unlinked synthetic document', content: '# Isolated\n\nEach proposal requires a countersignature.' };
  const local = buildEvidenceGraph([source, evidenceDocuments.find((document) => document.id === 'dispatch-signoff')!, unrelated], searchControls,
    { ...graphManifest, currentRevisions: {}, relationships: [] });
  const result = searchEvidenceGraph(local, query);
  const found = result.hits.find((hit) => hit.passage.id === signoff.id)!;
  assert.equal(found.path.seed.kind, 'lexical'); assert.equal(found.path.steps.length, 2);
  assert.ok(!result.baseline.some((hit) => hit.passage.id === signoff.id));
  assert.ok(!result.hits.some((hit) => hit.passage.documentId === unrelated.id));
});

test('revision scope is explicit: pinned archived references are not upgraded and both conflicting revisions can be inspected', () => {
  const current = searchEvidenceGraph(graph, query);
  assert.ok(!current.hits.some((hit) => hit.passage.documentId === 'dispatch-gates' && hit.passage.revision === '1'));
  assert.equal(current.excludedReferences.length, 1);
  const all = searchEvidenceGraph(graph, { ...query, includeArchived: true });
  const rules = all.hits.filter((hit) => hit.passage.documentId === 'dispatch-gates' && hit.passage.section.endsWith('Gate rule'));
  assert.deepEqual(rules.map((hit) => hit.passage.revision).sort(), ['1', '2']);
  assert.equal(new Set(rules.map((hit) => hit.passage.id)).size, 2);
  assert.ok(rules.find((hit) => hit.passage.revision === '1')!.passage.text.includes('must countersign'));
  assert.ok(rules.find((hit) => hit.passage.revision === '2')!.passage.text.includes('without a countersignature'));
  const unknownCurrent = buildEvidenceGraph(undefined, undefined, { ...graphManifest, currentRevisions: {} });
  assert.ok(unknownCurrent.diagnostics.some((entry) => entry.message.includes('Current revision is unresolved')));
  assert.ok(!searchEvidenceGraph(unknownCurrent, query).hits.some((hit) => hit.passage.documentId === 'dispatch-gates'));
});

test('missing references and invalid relationship quotations remain unresolved; system scope does not expand through shared controls', () => {
  const missing = graph.diagnostics.find((entry) => entry.target.includes('unpublished-annex'))!;
  assert.equal(missing.source!.documentId, 'dispatch-gates'); assert.equal(missing.source!.revision, '2');
  assert.ok(!graph.nodes.some((node) => node.id.includes('unpublished-annex')));
  const unpinnedDocuments = searchDocuments.map((document) => document.id === 'dispatch-gates' && document.revision === '2'
    ? { ...document, content: document.content.replace('evidence:dispatch-signoff@1#', 'evidence:dispatch-signoff#') } : document);
  const unpinned = buildEvidenceGraph(unpinnedDocuments);
  assert.ok(unpinned.diagnostics.some((entry) => entry.target.includes('evidence:dispatch-signoff#')));
  assert.ok(!hitIds(searchEvidenceGraph(unpinned, query)).includes(signoff.id));
  const changed = structuredClone(graphManifest); changed.relationships[0].source.quote = 'A quote that is not in the document';
  const invalid = buildEvidenceGraph(undefined, undefined, changed);
  assert.ok(invalid.diagnostics.some((entry) => entry.id === changed.relationships[0].id));
  assert.ok(!hitIds(searchEvidenceGraph(invalid, query)).includes(signoff.id));
  assert.deepEqual(searchEvidenceGraph(graph, { ...query, systemId: 'tutor' }).hits.map((hit) => hit.passage.systemId), ['tutor']);
  assert.equal(searchEvidenceGraph(graph, { ...query, systemId: 'ledger' }).hits.length, 0);
});

test('cycles and duplicate candidates are suppressed, paths are executable, and every budget is bounded and reported', () => {
  const result = searchEvidenceGraph(graph, { ...query, maxDepth: 8, includeArchived: true });
  assert.equal(new Set(hitIds(result)).size, result.hits.length);
  for (const hit of result.hits) {
    assert.equal(new Set(hit.path.nodeIds).size, hit.path.nodeIds.length);
    assert.equal(hit.path.nodeIds.length, hit.path.steps.length + 1);
    hit.path.steps.forEach((step, index) => {
      const edge = graph.edges.find((edge) => edge.id === step.edgeId)!;
      assert.deepEqual([hit.path.nodeIds[index], hit.path.nodeIds[index + 1]], step.direction === 'forward' ? [edge.from, edge.to] : [edge.to, edge.from]);
    });
  }
  for (const [limit, amount] of [['maxVisited', 1], ['maxEdges', 1], ['maxResults', 2]] as const) {
    const bounded = searchEvidenceGraph(graph, { ...query, [limit]: amount });
    assert.ok(bounded.limitsReached.includes(limit));
    assert.ok(bounded.visited <= bounded.query.maxVisited); assert.ok(bounded.edgesExamined <= bounded.query.maxEdges); assert.ok(bounded.hits.length <= bounded.query.maxResults);
  }
  for (const invalid of [{ maxDepth: 9 }, { maxDepth: -1 }, { maxVisited: Infinity }, { maxEdges: 0 }, { maxResults: 1.5 }]) assert.throws(() => searchEvidenceGraph(graph, { ...query, ...invalid }));
});

test('human relationships are independent annotations, never retrieval seeds or evidence of search success', () => {
  const review: EvidenceReview = { controlId: 'human-oversight', passage: signoff, judgment: 'ambiguous', relevance: 'relevant', comment: 'Human annotation only.', updatedAt: '2026-11-06T10:00:00Z' };
  const reviewed = buildEvidenceGraph(undefined, undefined, undefined, [review]);
  const edge = reviewed.edges.find((entry) => entry.kind === 'human_review')!;
  assert.equal(edge.origin, 'human_reviewed'); assert.equal(edge.reviewStatus, 'reviewed');
  assert.deepEqual(searchEvidenceGraph(reviewed, query).hits, searchEvidenceGraph(graph, query).hits);
  assert.deepEqual(summarizeSearchPool(searchEvidenceGraph(graph, query).baseline, graph, query, [review]), { relevant: 1, retrievedRelevant: 0, missedRelevant: 1 });
  assert.deepEqual(summarizeSearchPool(searchEvidenceGraph(graph, query).hits, graph, query, [review]), { relevant: 1, retrievedRelevant: 1, missedRelevant: 0 });
  assert.ok(searchEvidenceGraph(reviewed, query).hits.every((hit) => hit.path.steps.every((step) => step.edgeId !== edge.id)));
});

test('old reviews still load; added revision/control reviews and graph search exports retain exact sources without altering the six-case experiment', () => {
  const passage = searchPassages.find((entry) => entry.documentId === 'dispatch-gates' && entry.revision === '2' && entry.section.endsWith('Gate rule'))!;
  const review: EvidenceReview = { controlId: 'two-person-gate', passage, judgment: 'contradicted', relevance: 'relevant', comment: 'Illustrative manual label.', updatedAt: '2026-11-06T10:00:00Z' };
  const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  values.set(EVIDENCE_KEY, JSON.stringify({ schemaVersion: 1, datasetVersion: DATASET_VERSION, reviews: [] }));
  assert.deepEqual(readEvidenceReviews(storage), []);
  const reviews = saveEvidenceReview([], review, review.controlId, passage);
  writeEvidenceReviews(storage, reviews); assert.deepEqual(readEvidenceReviews(storage), reviews);
  const snapshot = snapshotEvidenceSearch(buildEvidenceGraph(undefined, undefined, undefined, reviews), searchEvidenceGraph(graph, query), 'graph', reviews);
  const exported = JSON.parse(exportEvidenceExperiment([], reviews, '', snapshot));
  assert.deepEqual(exported.search, snapshot); assert.equal(exported.experiment.cases.length, 6);
  assert.equal(exported.classificationEvaluation.n, 0); assert.equal(exported.classificationEvaluation.missingPredictions, 6);
  assert.deepEqual(exported.documents, evidenceDocuments); assert.deepEqual(exported.search.graph.configuration, graphManifest);
  const revision = (exported.search.graph.nodes as EvidenceGraph['nodes']).find((node) => node.id === graphIds.revision(passage.documentId, passage.revision));
  assert.equal(revision?.kind, 'revision');
  if (revision?.kind === 'revision') assert.equal(revision.document.content.slice(passage.start, passage.end), passage.text);
});
