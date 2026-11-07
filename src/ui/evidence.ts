import documents from '../../examples/evidence/documents.json';
import graphDocuments from '../../examples/evidence/graph-documents.json';
import graphRelations from '../../examples/evidence/graph-relations.json';

export type EvidenceDocument = { id: string; revision: string; systemId: string; title: string; content: string };
export type EvidenceControl = { id: string; title: string; statement: string; assessmentField: string; terms: string[] };
export const evidenceControls: EvidenceControl[] = [{
  id: 'human-oversight', title: 'Human Oversight',
  statement: 'A human must approve every recommendation before the system executes it.',
  assessmentField: 'human_oversight_evidence',
  terms: ['human', 'humans', 'approval', 'approve', 'review', 'reviews', 'supervisor', 'operator', 'operators', 'override', 'automatically'],
}];
export const evidenceDocuments: EvidenceDocument[] = documents;
// Additive search corpus: the original six-case corpus and saved sources stay unchanged.
export const SEARCH_DATASET_VERSION = 'synthetic-oversight-graph-1';
export const searchDocuments: EvidenceDocument[] = [...evidenceDocuments, ...graphDocuments];
export const searchControls: EvidenceControl[] = [...evidenceControls, ...graphRelations.controls];
export const EVIDENCE_KEY = 'jev.evidence-reviews.v1';
export const DATASET_VERSION = 'synthetic-oversight-1';
export const RETRIEVER_VERSION = 'term-match-1';
export const SEGMENTER_VERSION = 'markdown-paragraphs-1';
export const evidenceLabels = ['supported', 'contradicted', 'insufficient_evidence', 'ambiguous', 'uncertain'] as const;
export const relevanceLabels = ['relevant', 'not_relevant', 'uncertain'] as const;
export type Passage = {
  id: string; documentId: string; revision: string; systemId: string; section: string;
  start: number; end: number; startLine: number; endLine: number; text: string;
};
export type EvidenceReview = {
  controlId: string; passage: Passage; judgment: typeof evidenceLabels[number];
  relevance: typeof relevanceLabels[number]; comment: string; updatedAt: string;
};

/** Offsets are zero-based UTF-16, end-exclusive; text is an exact source slice. */
export function segmentDocument(document: EvidenceDocument): Passage[] {
  const passages: Passage[] = [];
  const headings: { level: number; title: string }[] = [];
  let start = -1; let end = 0; let startLine = 0; let endLine = 0; let lineNumber = 0;
  function flush() {
    if (start < 0) return;
    passages.push({ id: `${document.id}@${document.revision}:${start}-${end}`,
      documentId: document.id, revision: document.revision, systemId: document.systemId,
      section: headings.map((heading) => heading.title).join(' / ') || 'Document',
      start, end, startLine, endLine, text: document.content.slice(start, end) });
    start = -1;
  }
  for (const match of document.content.matchAll(/([^\r\n]*)(?:\r\n|\n|\r|$)/g)) {
    if (match.index === document.content.length) break;
    const line = match[1]; lineNumber++;
    const heading = /^(#{1,6}) +(.+)$/.exec(line);
    if (heading || !line.trim()) flush();
    if (heading) {
      while (headings.length && headings[headings.length - 1].level >= heading[1].length) headings.pop();
      headings.push({ level: heading[1].length, title: heading[2] });
    } else if (line.trim()) {
      if (start < 0) { start = match.index; startLine = lineNumber; }
      end = match.index + line.length; endLine = lineNumber;
    }
  }
  flush(); return passages;
}
export const evidencePassages = evidenceDocuments.flatMap(segmentDocument);
export const searchPassages = searchDocuments.flatMap(segmentDocument);

export function retrievePassages(passages: Passage[], control: EvidenceControl) {
  return passages.map((passage) => ({ passage, matchedTerms: control.terms.filter((term) =>
    new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(passage.text)) }))
    .filter((entry) => entry.matchedTerms.length > 0)
    .sort((a, b) => b.matchedTerms.length - a.matchedTerms.length || (a.passage.id < b.passage.id ? -1 : a.passage.id > b.passage.id ? 1 : 0));
}

export function saveEvidenceReview(reviews: EvidenceReview[], review: EvidenceReview | null, controlId: string, passage: Passage) {
  if (!searchControls.some((control) => control.id === controlId)
    || !searchPassages.some((entry) => JSON.stringify(entry) === JSON.stringify(passage))) throw new Error('Unknown control or changed source passage.');
  if (review && (review.controlId !== controlId || JSON.stringify(review.passage) !== JSON.stringify(passage)
    || !evidenceLabels.includes(review.judgment) || !relevanceLabels.includes(review.relevance)
    || typeof review.comment !== 'string' || review.comment.length > 1000
    || typeof review.updatedAt !== 'string' || !Number.isFinite(Date.parse(review.updatedAt)))) throw new Error('Invalid evidence review.');
  const next = reviews.filter((entry) => !(entry.controlId === controlId && entry.passage.id === passage.id));
  return review ? [...next, review] : next;
}

export function readEvidenceReviews(storage: Pick<Storage, 'getItem'>): EvidenceReview[] {
  const raw = storage.getItem(EVIDENCE_KEY); if (!raw) return [];
  const saved = JSON.parse(raw);
  if (saved?.schemaVersion !== 1 || saved.datasetVersion !== DATASET_VERSION || !Array.isArray(saved.reviews)
    || (saved.searchDatasetVersion !== undefined && saved.searchDatasetVersion !== SEARCH_DATASET_VERSION)
    || saved.reviews.length > searchPassages.length * searchControls.length) throw new Error('Invalid evidence reviews or changed dataset.');
  let checked: EvidenceReview[] = [];
  for (const review of saved.reviews) checked = saveEvidenceReview(checked, review, review.controlId, review.passage);
  if (checked.length !== saved.reviews.length) throw new Error('Duplicate evidence reviews.');
  return checked;
}
export function writeEvidenceReviews(storage: Pick<Storage, 'setItem'>, reviews: EvidenceReview[]) {
  storage.setItem(EVIDENCE_KEY, JSON.stringify({ schemaVersion: 1, datasetVersion: DATASET_VERSION, searchDatasetVersion: SEARCH_DATASET_VERSION, reviews }));
}

export function summarizeEvidence(reviews: EvidenceReview[]) {
  const counts = Object.fromEntries(evidenceLabels.map((label) => [label, reviews.filter((review) => review.judgment === label).length]));
  const relevant = reviews.filter((review) => review.relevance === 'relevant');
  const retrievedRelevant = relevant.filter((review) => {
    const control = searchControls.find((entry) => entry.id === review.controlId)!;
    return retrievePassages([review.passage], control).length > 0;
  }).length;
  return { reviewed: reviews.length, counts, relevant: relevant.length, retrievedRelevant, missedRelevant: relevant.length - retrievedRelevant };
}
export function exportEvidence(reviews: EvidenceReview[]) {
  return JSON.stringify({ schemaVersion: 1, datasetVersion: DATASET_VERSION, synthetic: true,
    segmenterVersion: SEGMENTER_VERSION, retrieverVersion: RETRIEVER_VERSION,
    offsetUnit: 'UTF-16 code units; zero-based; end-exclusive', controls: evidenceControls,
    documents: evidenceDocuments, passages: evidencePassages,
    searchCorpus: { version: SEARCH_DATASET_VERSION, documents: searchDocuments, passages: searchPassages, controls: searchControls },
    retrieval: evidenceControls.map((control) => ({ controlId: control.id,
      candidates: retrievePassages(evidencePassages, control).map(({ passage, matchedTerms }) => ({ passageId: passage.id, matchedTerms })) })),
    reviews, evaluation: summarizeEvidence(reviews) }, null, 2);
}
