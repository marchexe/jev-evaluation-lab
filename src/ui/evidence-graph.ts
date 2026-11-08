import relations from '../../examples/evidence/graph-relations.json';
import {
  searchDocuments, searchControls, retrievePassages, segmentDocument, SEARCH_DATASET_VERSION,
  type EvidenceDocument, type EvidenceControl, type EvidenceReview, type Passage
} from './evidence';

import { diversifyGraphHits, type GraphRanking, type GraphRankingInfo } from './graph-ranking';

export const GRAPH_VERSION = 'evidence-graph-1';
export const GRAPH_SEARCH_VERSION = 'bounded-evidence-bfs-1';
type Locator = { documentId: string; revision: string; section: string };
type Annotation = {
  id: string; kind: 'related_control' | 'control_section' | 'supersedes';
  fromControl?: string; toControl?: string; target?: Locator; documentId?: string; revision?: string; previousRevision?: string;
  source: Locator & { quote: string }
};
export type GraphManifest = { version: string; currentRevisions: Record<string, string>; controls: EvidenceControl[]; relationships: Annotation[] };
export const graphManifest = relations as GraphManifest;
type NodeData =
  | { kind: 'system'; systemId: string }
  | { kind: 'control'; control: EvidenceControl }
  | { kind: 'document'; documentId: string; systemId: string }
  | { kind: 'revision'; document: EvidenceDocument; current: boolean | null }
  | ({ kind: 'section'; systemId: string } & Locator)
  | { kind: 'passage'; passage: Passage };
export type GraphNode = { id: string; label: string } & NodeData;
export type EdgeKind = 'system_document' | 'document_revision' | 'revision_section' | 'section_passage'
  | 'related_control' | 'control_section' | 'references' | 'supersedes' | 'human_review';
export type GraphProvenance = { kind: 'source'; passage: Passage; quote: string }
  | { kind: 'metadata'; record: string; field: string }
  | { kind: 'review'; review: EvidenceReview };
export type GraphEdge = {
  id: string; kind: EdgeKind; from: string; to: string;
  origin: 'explicit' | 'derived' | 'human_reviewed'; reviewStatus: 'unreviewed' | 'reviewed'; provenance: GraphProvenance
};
export type GraphDiagnostic = { id: string; message: string; target: string; source?: Passage };
export type EvidenceGraph = {
  version: string; corpusVersion: string; relationVersion: string;
  configuration: GraphManifest; nodes: GraphNode[]; edges: GraphEdge[]; diagnostics: GraphDiagnostic[]
};
const enc = encodeURIComponent;
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const graphIds = {
  system: (id: string) => `system:${enc(id)}`, control: (id: string) => `control:${enc(id)}`,
  document: (id: string) => `document:${enc(id)}`,
  revision: (id: string, revision: string) => `revision:${enc(id)}@${enc(revision)}`,
  section: (value: Locator) => `section:${enc(value.documentId)}@${enc(value.revision)}:${enc(value.section)}`,
  passage: (id: string) => `passage:${enc(id)}`,
};

/** No semantic relationships are inferred from similar words or shared system membership. */
export function buildEvidenceGraph(documents: EvidenceDocument[] = searchDocuments, controls: EvidenceControl[] = searchControls,
  manifest: GraphManifest = graphManifest, reviews: EvidenceReview[] = []): EvidenceGraph {
  const nodes = new Map<string, GraphNode>(); const edges = new Map<string, GraphEdge>(); const diagnostics: GraphDiagnostic[] = [];
  const passages = documents.flatMap(segmentDocument);
  const addNode = (node: GraphNode) => {
    const before = nodes.get(node.id);
    if (before && JSON.stringify(before) !== JSON.stringify(node)) throw new Error(`Conflicting graph identity: ${node.id}`);
    nodes.set(node.id, node);
  };
  function addEdge(kind: EdgeKind, from: string, to: string, key: string, origin: GraphEdge['origin'], provenance: GraphProvenance) {
    const id = `edge:${kind}:${enc(from)}:${enc(to)}:${enc(key)}`;
    if (!nodes.has(from) || !nodes.has(to)) { diagnostics.push({ id, target: to, message: 'Relationship endpoint is missing; no edge was created.' }); return; }
    const edge: GraphEdge = { id, kind, from, to, origin, reviewStatus: origin === 'human_reviewed' ? 'reviewed' : 'unreviewed', provenance };
    if (edges.has(id)) throw new Error(`Duplicate graph relationship: ${id}`);
    edges.set(id, edge);
  }
  for (const control of controls) addNode({ id: graphIds.control(control.id), kind: 'control', control: structuredClone(control), label: control.title });
  const revisionKeys = new Set<string>();
  for (const document of documents) {
    const revisionId = graphIds.revision(document.id, document.revision);
    if (revisionKeys.has(revisionId)) throw new Error(`Duplicate immutable revision: ${revisionId}`);
    revisionKeys.add(revisionId);
    const siblings = documents.filter((entry) => entry.id === document.id);
    const currentRevision = manifest.currentRevisions[document.id] ?? (siblings.length === 1 ? document.revision : null);
    const resolved = currentRevision !== null && siblings.some((entry) => entry.revision === currentRevision);
    if (!resolved) diagnostics.push({ id: `current:${revisionId}`, target: revisionId, message: 'Current revision is unresolved; excluded from current-only search.' });
    addNode({ id: graphIds.system(document.systemId), kind: 'system', systemId: document.systemId, label: document.systemId });
    addNode({ id: graphIds.document(document.id), kind: 'document', documentId: document.id, systemId: document.systemId, label: document.id });
    addNode({ id: revisionId, kind: 'revision', document: structuredClone(document), current: resolved ? document.revision === currentRevision : null, label: `${document.id}@${document.revision}` });
    addEdge('document_revision', graphIds.document(document.id), revisionId, revisionId, 'explicit', { kind: 'metadata', record: `${document.id}@${document.revision}`, field: 'revision' });
  }
  for (const document of documents.filter((entry, index) => documents.findIndex((value) => value.id === entry.id) === index)) {
    addEdge('system_document', graphIds.system(document.systemId), graphIds.document(document.id), document.id, 'explicit', { kind: 'metadata', record: document.id, field: 'systemId' });
  }
  for (const passage of passages) {
    const sectionId = graphIds.section(passage);
    if (!nodes.has(sectionId)) {
      addNode({ id: sectionId, kind: 'section', documentId: passage.documentId, revision: passage.revision, section: passage.section, systemId: passage.systemId, label: passage.section });
      addEdge('revision_section', graphIds.revision(passage.documentId, passage.revision), sectionId, sectionId, 'derived', { kind: 'source', passage, quote: passage.text });
    }
    addNode({ id: graphIds.passage(passage.id), kind: 'passage', passage: structuredClone(passage), label: passage.id });
    addEdge('section_passage', sectionId, graphIds.passage(passage.id), passage.id, 'derived', { kind: 'source', passage, quote: passage.text });
  }
  const annotationIds = new Set<string>();
  for (const relation of manifest.relationships) {
    if (annotationIds.has(relation.id)) throw new Error('Duplicate relationship annotation ID.');
    annotationIds.add(relation.id);
    const matches = passages.filter((passage) => passage.documentId === relation.source.documentId && passage.revision === relation.source.revision
      && passage.section === relation.source.section && !!relation.source.quote && passage.text.includes(relation.source.quote));
    const source = matches.length === 1 ? matches[0] : undefined;
    if (!source) { diagnostics.push({ id: relation.id, target: relation.id, message: 'Relationship source quote is missing or ambiguous; no edge was created.' }); continue; }
    const from = relation.kind === 'supersedes' ? graphIds.revision(relation.documentId!, relation.revision!) : graphIds.control(relation.fromControl!);
    const to = relation.kind === 'related_control' ? graphIds.control(relation.toControl!) : relation.kind === 'control_section'
      ? graphIds.section(relation.target!) : graphIds.revision(relation.documentId!, relation.previousRevision!);
    if (!nodes.has(from) || !nodes.has(to)) { diagnostics.push({ id: relation.id, target: to, source, message: 'Declared relationship target is unresolved; no edge was created.' }); continue; }
    addEdge(relation.kind, from, to, relation.id, 'explicit', { kind: 'source', passage: source, quote: relation.source.quote });
  }
  // Only pinned, local evidence: links are parsed. There is no URL fetch or fuzzy target resolution.
  for (const passage of passages) for (const match of passage.text.matchAll(/\[[^\]]+\]\((evidence:[^)]*)\)/g)) {
    let target = match[0];
    try {
      const pinned = /^evidence:([^@\s#]+)@([^#\s]+)#([^\s]+)$/.exec(match[1]);
      if (!pinned) throw new Error('unpinned reference');
      const locator = { documentId: decodeURIComponent(pinned[1]), revision: decodeURIComponent(pinned[2]), section: decodeURIComponent(pinned[3]) };
      target = graphIds.section(locator);
      if (!nodes.has(target)) throw new Error('unresolved');
      addEdge('references', graphIds.passage(passage.id), target, String(match.index), 'explicit', { kind: 'source', passage, quote: match[0] });
    } catch { diagnostics.push({ id: `reference:${passage.id}:${match.index}`, target, source: passage, message: 'Pinned document/section reference is unresolved; no target was invented.' }); }
  }
  for (const review of reviews) {
    const source = passages.find((passage) => JSON.stringify(passage) === JSON.stringify(review.passage));
    if (!source || !nodes.has(graphIds.control(review.controlId))) { diagnostics.push({ id: `review:${review.passage.id}`, target: review.passage.id, message: 'Review source/control is incompatible; no review edge was created.' }); continue; }
    addEdge('human_review', graphIds.control(review.controlId), graphIds.passage(source.id), source.id, 'human_reviewed', { kind: 'review', review: structuredClone(review) });
  }
  return {
    version: GRAPH_VERSION, corpusVersion: SEARCH_DATASET_VERSION, relationVersion: manifest.version,
    configuration: structuredClone(manifest),
    nodes: [...nodes.values()].sort((a, b) => cmp(a.id, b.id)), edges: [...edges.values()].sort((a, b) => cmp(a.id, b.id)),
    diagnostics: diagnostics.sort((a, b) => cmp(a.id, b.id))
  };
}

export type GraphQuery = {
  systemId: string; controlId: string; maxDepth: number; includeArchived: boolean;
  maxVisited: number; maxEdges: number; maxResults: number
};
export const DEFAULT_GRAPH_LIMITS = { maxDepth: 5, maxVisited: 200, maxEdges: 1000, maxResults: 50 };
export type SearchPath = {
  seed: { kind: 'control' | 'lexical'; nodeId: string; matchedTerms: string[] };
  nodeIds: string[]; steps: { edgeId: string; direction: 'forward' | 'reverse' }[]
};
export type GraphHit = { passage: Passage; matchedTerms: string[]; path: SearchPath };
export type GraphSearchResult = {
  version: string; query: GraphQuery; hits: GraphHit[]; baseline: GraphHit[];
  visited: number; edgesExamined: number; limitsReached: string[]; excludedReferences: { edgeId: string; reason: string }[]; diagnostics: GraphDiagnostic[]
};

export function searchEvidenceGraph(graph: EvidenceGraph, query: GraphQuery & { ranking?: GraphRanking }): GraphSearchResult & { ranking?: GraphRankingInfo } {
  if (query.ranking !== undefined && !['lexical-path-1', 'document-diversity-1'].includes(query.ranking)) throw new Error('Invalid graph ranking.');
  for (const [name, value, upper] of [['maxDepth', query.maxDepth, 8], ['maxVisited', query.maxVisited, 1000], ['maxEdges', query.maxEdges, 20000], ['maxResults', query.maxResults, 100]] as const) {
    if (!Number.isInteger(value) || value < (name === 'maxDepth' ? 0 : 1) || value > upper) throw new Error(`Invalid graph search limit: ${name}`);
  }
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const control = nodes.get(graphIds.control(query.controlId));
  if (control?.kind !== 'control' || !nodes.has(graphIds.system(query.systemId))) throw new Error('Unknown graph query system or control.');
  function inScope(node: GraphNode) {
    if (node.kind === 'control') return true;
    const source = node.kind === 'passage' ? node.passage : node.kind === 'revision' ? { ...node.document, documentId: node.document.id } : node;
    if (!('systemId' in source) || source.systemId !== query.systemId) return false;
    if ('revision' in source && 'documentId' in source) {
      const revision = nodes.get(graphIds.revision(source.documentId, source.revision));
      return query.includeArchived || (revision?.kind === 'revision' && revision.current === true);
    }
    return true;
  }
  const eligible = graph.nodes.filter((node): node is GraphNode & { kind: 'passage' } => node.kind === 'passage' && inScope(node));
  const lexical = retrievePassages(eligible.map((node) => node.passage), control.control);
  const lexicalTerms = new Map(lexical.map((hit) => [hit.passage.id, hit.matchedTerms]));
  const seedPath = (nodeId: string, kind: 'lexical' | 'control', matchedTerms: string[] = []): SearchPath => ({ seed: { nodeId, kind, matchedTerms }, nodeIds: [nodeId], steps: [] });
  const baseline: GraphHit[] = lexical.map((hit) => ({ ...hit, path: seedPath(graphIds.passage(hit.passage.id), 'lexical', hit.matchedTerms) }));
  const adjacent = new Map<string, { edge: GraphEdge; next: string; direction: 'forward' | 'reverse' }[]>();
  const append = (id: string, step: { edge: GraphEdge; next: string; direction: 'forward' | 'reverse' }) => adjacent.set(id, [...(adjacent.get(id) ?? []), step]);
  for (const edge of graph.edges) {
    // Membership/supersession are provenance, not blanket expansion. Human labels never seed retrieval.
    if (!['related_control', 'control_section', 'references', 'section_passage'].includes(edge.kind)) continue;
    append(edge.from, { edge, next: edge.to, direction: 'forward' });
    if (edge.kind === 'section_passage' || edge.kind === 'related_control') append(edge.to, { edge, next: edge.from, direction: 'reverse' });
  }
  const queue: { nodeId: string; path: SearchPath }[] = []; const visited = new Set<string>(); const limits = new Set<string>();
  const exclusions = new Map<string, { edgeId: string; reason: string }>();
  const enqueue = (nodeId: string, path: SearchPath) => {
    if (visited.has(nodeId)) return;
    if (visited.size >= query.maxVisited) { limits.add('maxVisited'); return; }
    visited.add(nodeId); queue.push({ nodeId, path });
  };
  enqueue(control.id, seedPath(control.id, 'control'));
  for (const hit of baseline) enqueue(graphIds.passage(hit.passage.id), hit.path);
  const hits: GraphHit[] = []; let edgesExamined = 0;
  for (let index = 0; index < queue.length; index++) {
    const item = queue[index]; const node = nodes.get(item.nodeId)!;
    if (node.kind === 'passage') hits.push({ passage: node.passage, matchedTerms: lexicalTerms.get(node.passage.id) ?? [], path: item.path });
    const nextSteps = adjacent.get(item.nodeId) ?? [];
    for (const step of nextSteps) {
      if (edgesExamined >= query.maxEdges) { limits.add('maxEdges'); break; }
      edgesExamined++;
      const next = nodes.get(step.next)!;
      const provenance = step.edge.provenance;
      const source = provenance.kind === 'source' ? nodes.get(graphIds.passage(provenance.passage.id)) : undefined;
      if (!inScope(next) || (source && !inScope(source))) {
        if (step.edge.kind === 'references') exclusions.set(step.edge.id, { edgeId: step.edge.id, reason: 'Pinned target or source is outside the selected system/current revision scope; not substituted.' });
        continue;
      }
      if (visited.has(next.id)) continue;
      if (item.path.steps.length >= query.maxDepth) { limits.add('maxDepth'); continue; }
      enqueue(next.id, { seed: item.path.seed, nodeIds: [...item.path.nodeIds, next.id], steps: [...item.path.steps, { edgeId: step.edge.id, direction: step.direction }] });
    }
  }
  hits.sort((a, b) => b.matchedTerms.length - a.matchedTerms.length || a.path.steps.length - b.path.steps.length || cmp(a.passage.id, b.passage.id));
  const ranked = query.ranking === 'document-diversity-1' ? diversifyGraphHits(hits) : null;
  if (hits.length > query.maxResults) limits.add('maxResults');
  return {
    version: ranked ? 'bounded-evidence-bfs-diversity-1' : GRAPH_SEARCH_VERSION, query, hits: (ranked?.hits ?? hits).slice(0, query.maxResults), baseline, visited: visited.size, edgesExamined,
    ...(ranked ? { ranking: ranked.ranking } : {}),
    limitsReached: [...limits].sort(), excludedReferences: [...exclusions.values()],
    diagnostics: graph.diagnostics.filter((entry) => !entry.source || entry.source.systemId === query.systemId)
  };
}

export function summarizeSearchPool(hits: GraphHit[], graph: EvidenceGraph, query: GraphQuery, reviews: EvidenceReview[]) {
  const passages = new Map(graph.nodes.filter((node) => node.kind === 'passage').map((node) => [node.passage.id, node.passage]));
  const relevant = reviews.filter((review) => {
    const revision = graph.nodes.find((node) => node.id === graphIds.revision(review.passage.documentId, review.passage.revision));
    return review.controlId === query.controlId && review.relevance === 'relevant' && review.passage.systemId === query.systemId
      && JSON.stringify(passages.get(review.passage.id)) === JSON.stringify(review.passage)
      && (query.includeArchived || (revision?.kind === 'revision' && revision.current === true));
  });
  const ids = new Set(hits.map((hit) => hit.passage.id)); const retrieved = relevant.filter((review) => ids.has(review.passage.id)).length;
  return { relevant: relevant.length, retrievedRelevant: retrieved, missedRelevant: relevant.length - retrieved };
}

export type EvidenceSearchSnapshot = {
  schemaVersion: 1; strategy: 'text' | 'graph'; graph: EvidenceGraph; result: GraphSearchResult;
  reviewedPool: { text: ReturnType<typeof summarizeSearchPool>; graph: ReturnType<typeof summarizeSearchPool> }
};
export function snapshotEvidenceSearch(graph: EvidenceGraph, result: GraphSearchResult, strategy: 'text' | 'graph', reviews: EvidenceReview[]): EvidenceSearchSnapshot {
  return {
    schemaVersion: 1, strategy, graph, result,
    reviewedPool: { text: summarizeSearchPool(result.baseline, graph, result.query, reviews), graph: summarizeSearchPool(result.hits, graph, result.query, reviews) }
  };
}
