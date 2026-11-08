import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { segmentDocument, type EvidenceDocument } from '../src/ui/evidence';
import { hashJson } from '../src/retrieval-evaluation';

test('pilot review covers the full independent pool with blank labels, exact source offsets and reproducible hashes', async () => {
  const dataset = JSON.parse(await readFile(new URL('../examples/evidence/pilot-review/dataset.json', import.meta.url), 'utf8'));
  const packet = JSON.parse(await readFile(new URL('../examples/evidence/pilot-review/review-template.json', import.meta.url), 'utf8'));
  const pool = dataset.queries.flatMap((query: any) => dataset.documents.filter((doc: any) => doc.systemId === query.systemId)
    .flatMap((doc: EvidenceDocument) => segmentDocument(doc).map(passage => ({ queryId: query.id, controlId: query.controlId, passage }))));
  assert.equal(packet.datasetHash, hashJson(dataset));
  assert.equal(packet.eligiblePoolHash, hashJson(pool));
  assert.equal(packet.judgments.length, 24);
  assert.deepEqual(packet.judgments.map(({ queryId, controlId, passage }: any) => ({ queryId, controlId, passage })), pool);
  assert.equal(packet.confirmation.independentReview, false);
  assert.equal(packet.confirmation.reviewerAlias, null);
  for (const row of packet.judgments) {
    assert.equal(row.relevance, null); assert.equal(row.evidenceJudgment, null); assert.equal(row.confirmed, false);
    const document = dataset.documents.find((doc: any) => doc.id === row.passage.documentId && doc.revision === row.passage.revision);
    assert.equal(document.content.slice(row.passage.start, row.passage.end), row.passage.text);
  }
  for (const query of dataset.queries) assert.ok(dataset.controls.some((control: any) => control.id === query.controlId));
  const development = dataset.documents.filter((doc: any) => doc.split === 'development').map((doc: any) => doc.id);
  const heldOut = dataset.documents.filter((doc: any) => doc.split === 'held-out').map((doc: any) => doc.id);
  assert.equal(development.some((id: string) => heldOut.includes(id)), false);
});
