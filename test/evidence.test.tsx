import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceControls, evidenceDocuments, evidencePassages, EVIDENCE_KEY, DATASET_VERSION,
  segmentDocument, retrievePassages, saveEvidenceReview, readEvidenceReviews, writeEvidenceReviews,
  summarizeEvidence, exportEvidence, type EvidenceReview } from '../src/ui/evidence';

const control = evidenceControls[0];
const passage = evidencePassages.find((entry) => entry.documentId === 'dispatch-policy')!;
const review: EvidenceReview = { controlId: control.id, passage, judgment: 'supported', relevance: 'relevant', comment: 'Explicit approval gate.', updatedAt: '2026-11-04T12:00:00Z' };

test('segmentation retains exact offsets, document revision, section path and line references', () => {
  for (const document of evidenceDocuments) {
    const chunks = segmentDocument(document);
    assert.deepEqual(chunks, segmentDocument(document));
    for (const chunk of chunks) {
      assert.equal(document.content.slice(chunk.start, chunk.end), chunk.text);
      assert.equal(chunk.revision, document.revision);
      assert.ok(chunk.section.length > 0);
      assert.equal(document.content.slice(0, chunk.start).split(/\r\n|\n|\r/).length, chunk.startLine);
    }
  }
  for (const newline of ['\n', '\r\n', '\r']) {
    const document = { id: 'edge', revision: '2', systemId: 'test', title: 'Test', content: ['# Title', '', '## Gate', '', '  Exact 🧪 text.', 'Second line.', '', '## Other', 'Last paragraph.'].join(newline) };
    const chunks = segmentDocument(document);
    assert.equal(chunks.length, 2); assert.equal(chunks[0].startLine, 5); assert.equal(chunks[0].endLine, 6);
    assert.equal(chunks[0].section, 'Title / Gate');
    assert.equal(chunks[0].text, `  Exact 🧪 text.${newline}Second line.`);
    assert.equal(document.content.slice(chunks[1].start, chunks[1].end), 'Last paragraph.');
  }
});

test('retrieval is deterministic, preserves conflicting passages and does not invent an absence judgment', () => {
  const found = retrievePassages(evidencePassages, control);
  assert.deepEqual(found, retrievePassages(evidencePassages, control));
  for (const id of ['dispatch-policy', 'dispatch-runbook', 'tutor-overview', 'dispatch-editorial']) assert.ok(found.some(({ passage }) => passage.documentId === id));
  assert.deepEqual(retrievePassages(evidencePassages.filter((p) => p.systemId === 'ledger'), control), []);
  const missed = evidencePassages.find((p) => p.documentId === 'dispatch-signoff' && p.section.endsWith('Final gate'))!;
  assert.deepEqual(retrievePassages([missed], control), []);
  assert.ok(found.every((entry) => !('judgment' in entry) && !('probability' in entry)));
  assert.equal(retrievePassages([{ ...passage, text: 'inhuman reviewable' }], { ...control, terms: ['human', 'review'] }).length, 0);
});

test('reviews edit and clear independently, preserve citations, and reject forged source text', () => {
  const original = JSON.stringify(evidencePassages);
  let reviews = saveEvidenceReview([], review, control.id, passage);
  reviews = saveEvidenceReview(reviews, { ...review, judgment: 'uncertain', comment: 'Needs scope check.' }, control.id, passage);
  assert.equal(reviews.length, 1); assert.equal(reviews[0].judgment, 'uncertain');
  assert.equal(JSON.stringify(evidencePassages), original);
  assert.deepEqual(saveEvidenceReview(reviews, null, control.id, passage), []);
  assert.throws(() => saveEvidenceReview([], { ...review, passage: { ...passage, text: 'invented quote' } }, control.id, passage));
  assert.throws(() => saveEvidenceReview([], { ...review, comment: 'x'.repeat(1001) }, control.id, passage));
});

test('reviewed-pool summaries expose missed relevant passages; persistence and export retain sources', () => {
  const missed = evidencePassages.find((p) => p.documentId === 'dispatch-signoff' && p.section.endsWith('Final gate'))!;
  const reviews = [review, { ...review, passage: missed, judgment: 'uncertain' as const }];
  assert.deepEqual(summarizeEvidence(reviews), { reviewed: 2, counts: { supported: 1, contradicted: 0, insufficient_evidence: 0, ambiguous: 0, uncertain: 1 }, relevant: 2, retrievedRelevant: 1, missedRelevant: 1 });
  assert.equal(summarizeEvidence([]).relevant, 0);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.deepEqual(readEvidenceReviews(storage), []);
  writeEvidenceReviews(storage, reviews); assert.deepEqual(readEvidenceReviews(storage), reviews);
  const exported = JSON.parse(exportEvidence(reviews));
  assert.deepEqual(exported.reviews, reviews); assert.deepEqual(exported.documents, evidenceDocuments);
  assert.deepEqual(exported.passages, evidencePassages); assert.equal(exported.retrieverVersion, 'term-match-1');
  values.set(EVIDENCE_KEY, JSON.stringify({ schemaVersion: 1, datasetVersion: 'changed', reviews }));
  assert.throws(() => readEvidenceReviews(storage));
  values.set(EVIDENCE_KEY, JSON.stringify({ schemaVersion: 1, datasetVersion: DATASET_VERSION, reviews: [review, review] }));
  assert.throws(() => readEvidenceReviews(storage), /Duplicate/);
  assert.throws(() => writeEvidenceReviews({ setItem: () => { throw new Error('Quota'); } }, reviews), /Quota/);
});
