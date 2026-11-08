import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { studyRecording } from '../test-support/evidence-recording';
import { judgeEvidence } from '../src/server/evidence-assessment';
import { createEvidenceHandler } from '../src/server/evidence-route.js';
import { importEvidenceExperiment } from '../src/ui/import-export';
import { searchPassages, searchControls, type EvidenceReview } from '../src/ui/evidence';
import { resolveEvidenceTarget, buildEvidenceRequest, validateEvidenceResult, readEvidenceRuns, writeEvidenceRuns, exportEvidenceExperiment, evaluateEvidenceRuns } from '../src/ui/evidence-runs';

const result = await studyRecording('15-1.json');
const selection = { passageId: result.passage.id, controlId: result.controlId };
const run = { id: 'recorded-register', result, humanReviewAtRequest: null };

test('all corpus passages and controls preview exact canonical sources, including archived revisions; old case identity stays stable', async () => {
  for (const passage of searchPassages) for (const control of searchControls) {
    const target = { passageId: passage.id, controlId: control.id };
    const preview = await judgeEvidence(target);
    assert.ok('request' in preview);
    assert.deepEqual(preview.request.state.passage, passage);
    assert.deepEqual(preview.request.state.control, { id: control.id, statement: control.statement });
    assert.equal('assessment' in preview, false);
  }
  const fixed = resolveEvidenceTarget('approval-gate');
  assert.deepEqual(await judgeEvidence({ passageId: fixed.passage.id, controlId: fixed.controlId }), await judgeEvidence('approval-gate'));
  for (const target of [{ passageId: 'missing', controlId: selection.controlId }, { ...selection, controlId: 'missing' }, { ...selection, text: 'injected' }]) {
    assert.throws(() => resolveEvidenceTarget(target));
  }
});

test('real register recording retains the exact SDK request, response and inference metadata through storage, export and import', async () => {
  const original = JSON.parse(await readFile(new URL('../examples/evidence/jev-study/recorded/15-1.json', import.meta.url), 'utf8'));
  assert.deepEqual(result.assessment.request, original.assessment.request);
  assert.deepEqual(result.assessment.response, original.assessment.response);
  assert.deepEqual(result.assessment, { ...original.assessment, profile: 'evidence' });
  assert.deepEqual(buildEvidenceRequest(selection, original.assessment.request.model, original.configuration), original.assessment.request);
  let raw = '';
  const storage = { setItem: (_key: string, value: string) => { raw = value; }, getItem: () => raw };
  writeEvidenceRuns(storage, [run]);
  const restored = readEvidenceRuns(storage);
  assert.deepEqual(restored, [run]);
  const packet = JSON.parse(exportEvidenceExperiment(restored, []));
  assert.deepEqual(importEvidenceExperiment(packet).runs, [run]);
  assert.equal(packet.corpus.documents.some((doc: { id: string }) => doc.id === 'dispatch-gates'), true);
  for (const edit of [
    (v: any) => { v.passage.text += ' Changed.'; },
    (v: any) => { v.controlId = 'two-person-gate'; },
    (v: any) => { v.passage.revision = '1'; },
    (v: any) => { v.caseId = 'approval-gate'; },
    (v: any) => { v.assessment.request.state.passage.text += ' Changed.'; },
  ]) { const invalid = structuredClone(result); edit(invalid); assert.throws(() => validateEvidenceResult(invalid)); }
  for (const edit of [
    (v: any) => { delete v.corpus; },
    (v: any) => { v.corpus.documents[0].content += ' Changed.'; },
    (v: any) => { v.corpus.controls[0].statement += ' Changed.'; },
  ]) { const invalid = structuredClone(packet); edit(invalid); assert.throws(() => importEvidenceExperiment(invalid)); }
});

test('additional passage evaluation has explicit denominators and does not reduce missing predictions in the six fixed cases', async () => {
  const review: EvidenceReview = { controlId: result.controlId, passage: result.passage, judgment: 'contradicted', relevance: 'relevant', comment: 'Test human annotation; not a gold label.', updatedAt: '2026-11-08T12:00:00Z' };
  const stats = evaluateEvidenceRuns([run], [review]);
  assert.equal(stats.n, 1); assert.equal(stats.additionalPassages, 1); assert.equal(stats.missingPredictions, 6);
  assert.equal(stats.fixedCases, 6);
  assert.equal(evaluateEvidenceRuns([run], [{ ...review, judgment: 'uncertain' }]).n, 0);
  assert.equal(evaluateEvidenceRuns([run], []).excludedUnlabeled, 1);
  assert.deepEqual(evaluateEvidenceRuns([run], [review]), evaluateEvidenceRuns([run], [{ ...review, relevance: 'not_relevant' }]));
});

test('passage API rejects injected text, mixed selectors and external origins before any operation; disabled inference stays offline', async () => {
  const keys = ['JEV_LIVE_INFERENCE_ENABLED', 'JEV_ALLOWED_ORIGINS', 'JEV_TRUST_PROXY_HEADERS', 'TYPESAFE_API_KEY'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let calls = 0;
  const handler = createEvidenceHandler(async (target: unknown) => { calls++; assert.deepEqual(target, selection); return result; });
  const request = (body: unknown, origin = 'https://lab.example') => new Request('https://lab.example/api/evidence', {
    method: 'POST', headers: { origin, host: 'lab.example', 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    keys.forEach(key => { delete process.env[key]; });
    process.env.JEV_LIVE_INFERENCE_ENABLED = 'true'; process.env.TYPESAFE_API_KEY = 'offline-test-key';
    const valid = { ...selection, live: true };
    for (const body of [{ ...valid, passage: result.passage }, { ...valid, text: 'injected' }, { ...valid, model: 'other' },
      { ...valid, caseId: 'approval-gate' }, { ...valid, controlId: 'missing' }, { ...valid, passageId: 'missing' }, { passageId: selection.passageId, live: true }]) {
      assert.equal((await handler(request(body))).status, 400);
    }
    assert.equal((await handler(request(valid, 'https://evil.example'))).status, 403);
    process.env.JEV_LIVE_INFERENCE_ENABLED = 'false'; assert.equal((await handler(request(valid))).status, 503);
    assert.equal(calls, 0);
    process.env.JEV_LIVE_INFERENCE_ENABLED = 'true';
    assert.deepEqual(await (await handler(request(valid))).json(), result); assert.equal(calls, 1);
  } finally { keys.forEach(key => { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }); }
});
