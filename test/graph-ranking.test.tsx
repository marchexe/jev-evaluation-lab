import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEvidenceGraph, searchEvidenceGraph, snapshotEvidenceSearch, DEFAULT_GRAPH_LIMITS, graphManifest } from '../src/ui/evidence-graph';
import { diversifyGraphHits } from '../src/ui/graph-ranking';
import { evidenceDocuments, searchControls } from '../src/ui/evidence';

const graph = buildEvidenceGraph();
const query = { ...DEFAULT_GRAPH_LIMITS, systemId: 'dispatch', controlId: 'human-oversight', includeArchived: false };
const ids = (hits: ReturnType<typeof searchEvidenceGraph>['hits']) => hits.map(hit => hit.passage.id);

test('document diversity promotes source coverage without adding candidates, changing paths or altering Text Search', () => {
  const original = searchEvidenceGraph(graph, query);
  const before = JSON.stringify(original);
  const diverse = searchEvidenceGraph(graph, { ...query, ranking: 'document-diversity-1' });
  const queue = 'dispatch-signoff@1:34-107';
  assert.equal(ids(original.hits).indexOf(queue) + 1, 7);
  assert.equal(ids(diverse.hits).indexOf(queue) + 1, 5);
  assert.deepEqual([...ids(diverse.hits)].sort(), [...ids(original.hits)].sort());
  for (const hit of diverse.hits) assert.deepEqual(hit, original.hits.find(entry => entry.passage.id === hit.passage.id));
  assert.deepEqual(diverse.baseline, original.baseline);
  assert.equal(new Set(diverse.hits.slice(0, 5).map(hit => `${hit.passage.documentId}@${hit.passage.revision}`)).size, 5);
  assert.equal(new Set(original.hits.slice(0, 5).map(hit => `${hit.passage.documentId}@${hit.passage.revision}`)).size, 4);
  assert.equal(diverse.visited, original.visited); assert.equal(diverse.edgesExamined, original.edgesExamined);
  assert.deepEqual(diverse.limitsReached, original.limitsReached);
  assert.equal(JSON.stringify(original), before);
  assert.equal(original.version, 'bounded-evidence-bfs-1');
  assert.equal(diverse.version, 'bounded-evidence-bfs-diversity-1');
  const exported = JSON.parse(JSON.stringify(snapshotEvidenceSearch(graph, diverse, 'graph', [])));
  assert.equal(exported.result.query.ranking, 'document-diversity-1');
  assert.deepEqual(exported.result.ranking.originalOrder, ids(original.hits));
  assert.deepEqual(exported.result.ranking.changes.find((row: { passageId: string }) => row.passageId === queue), { passageId: queue, previousRank: 7, rank: 5 });
});

test('ranking preserves group-internal order, keeps archived revisions separate, and applies the result cap after diversification', () => {
  const legacy = searchEvidenceGraph(graph, { ...query, includeArchived: true });
  const ranked = diversifyGraphHits(legacy.hits);
  for (const hit of legacy.hits) {
    const sameSource = (entry: typeof hit) => entry.passage.documentId === hit.passage.documentId && entry.passage.revision === hit.passage.revision;
    assert.deepEqual(ids(ranked.hits.filter(sameSource)), ids(legacy.hits.filter(sameSource)));
  }
  assert.ok(ranked.hits.some(hit => hit.passage.documentId === 'dispatch-gates' && hit.passage.revision === '1'));
  assert.ok(ranked.hits.some(hit => hit.passage.documentId === 'dispatch-gates' && hit.passage.revision === '2'));
  const capped = searchEvidenceGraph(graph, { ...query, ranking: 'document-diversity-1', maxResults: 5 });
  assert.equal(capped.hits.length, 5); assert.ok(capped.limitsReached.includes('maxResults'));
  assert.ok(ids(capped.hits).includes('dispatch-signoff@1:34-107'));
  assert.equal(capped.ranking!.candidateCount, 7);
  assert.deepEqual(diversifyGraphHits([]).hits, []);
  assert.deepEqual(diversifyGraphHits([legacy.hits[0]]).hits, [legacy.hits[0]]);
  assert.throws(() => diversifyGraphHits([legacy.hits[0], legacy.hits[0]]), /Duplicate/);
});

test('diversity does not repair missing links, infer relevance, bypass scope or expand execution budgets', () => {
  assert.equal(searchEvidenceGraph(graph, { ...query, ranking: 'document-diversity-1', systemId: 'ledger' }).hits.length, 0);
  for (const maxDepth of [0, 4, 5]) {
    const original = searchEvidenceGraph(graph, { ...query, maxDepth });
    const ranked = searchEvidenceGraph(graph, { ...query, maxDepth, ranking: 'document-diversity-1' });
    assert.deepEqual([...ids(ranked.hits)].sort(), [...ids(original.hits)].sort());
    assert.equal(ranked.visited, original.visited); assert.equal(ranked.edgesExamined, original.edgesExamined);
  }
  const unlinked = buildEvidenceGraph(undefined, undefined, { ...graphManifest, relationships: [] });
  assert.ok(!ids(searchEvidenceGraph(unlinked, { ...query, ranking: 'document-diversity-1' }).hits).includes('dispatch-signoff@1:34-107'));
  const distractor = { id: 'lexical-noise', revision: '1', systemId: 'dispatch', title: 'Unrelated editorial review',
    content: '# Editorial review\n\nA human reviews spelling. This does not approve system recommendations.' };
  const separate = buildEvidenceGraph([evidenceDocuments[0], distractor], searchControls, { ...graphManifest, currentRevisions: {}, relationships: [] });
  assert.ok(searchEvidenceGraph(separate, { ...query, ranking: 'document-diversity-1' }).hits.some(hit => hit.passage.documentId === distractor.id));
  for (const limits of [{ maxVisited: 1 }, { maxEdges: 1 }, { maxResults: 1 }]) {
    const original = searchEvidenceGraph(graph, { ...query, ...limits });
    const ranked = searchEvidenceGraph(graph, { ...query, ...limits, ranking: 'document-diversity-1' });
    assert.equal(ranked.visited, original.visited); assert.equal(ranked.edgesExamined, original.edgesExamined);
    assert.ok(ranked.hits.length <= ranked.query.maxResults);
  }
  assert.throws(() => searchEvidenceGraph(graph, { ...query, ranking: 'unknown' as never }), /Invalid graph ranking/);
});
