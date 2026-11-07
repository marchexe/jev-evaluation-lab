import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { judgeEvidence } from '../src/server/evidence-assessment';
import { createEvidenceHandler } from '../src/server/evidence-route.js';
import { evidenceControls, evidencePassages, retrievePassages, summarizeEvidence, type EvidenceReview } from '../src/ui/evidence';
import { experiment, resolveEvidenceCase, buildEvidenceRequest, validateEvidenceResult, readEvidenceRuns, writeEvidenceRuns,
  EVIDENCE_RUNS_KEY, evaluateEvidenceRuns, scoreEvidenceRows, exportEvidenceExperiment,
  type EvidenceResult, type EvidenceRun, type JudgmentCategory, type ComparisonRow } from '../src/ui/evidence-runs';

const recording: EvidenceResult = JSON.parse(await readFile(new URL('./fixtures/jev-evidence-approval-recorded.json', import.meta.url), 'utf8'));
const run: EvidenceRun = { id: 'recorded-run', result: recording, humanReviewAtRequest: null };
const answer = recording.assessment.response.answers.evidence_judgment;
assert.equal(answer.type, 'choice');
const predicted = (answer as { choice: JudgmentCategory }).choice;
const review: EvidenceReview = { controlId: recording.controlId, passage: recording.passage, judgment: predicted, relevance: 'relevant', comment: 'Test reviewer label.', updatedAt: '2026-11-04T12:00:00Z' };

test('fixed experiment resolves exact sources; SDK builders preview the recorded question without inference', async () => {
  assert.equal(experiment.cases.length, 6);
  for (const entry of experiment.cases) {
    const item = resolveEvidenceCase(entry.id);
    assert.equal(item.passage.revision, entry.revision);
    const preview = await judgeEvidence(entry.id);
    assert.equal('assessment' in preview, false);
    if (!('request' in preview)) throw new Error('Expected an offline preview.');
    assert.deepEqual(preview.request.questions, recording.assessment.request.questions);
    assert.equal(preview.controlId, evidenceControls[0].id);
  }
  validateEvidenceResult(recording);
  assert.deepEqual(recording.assessment.request, buildEvidenceRequest(recording.caseId, recording.assessment.request.model));
  assert.throws(() => validateEvidenceResult({ ...recording, passage: { ...recording.passage, text: 'fabricated' } }));
  assert.throws(() => validateEvidenceResult({ ...recording, assessment: { ...recording.assessment, schemaVersion: 2 } }));
});

test('case references must identify one exact paragraph, rather than silently choosing the first', () => {
  const passage = resolveEvidenceCase(recording.caseId).passage;
  evidencePassages.push({ ...passage, id: 'another-paragraph-in-the-same-section' });
  try { assert.throws(() => resolveEvidenceCase(recording.caseId), /changed experiment case/); }
  finally { evidencePassages.pop(); }
});

test('six independent human annotations expose retrieval misses without changing Jev classification statistics', () => {
  // Provisional human annotations for the review procedure, never model responses or verified ground truth.
  const labels: EvidenceReview['judgment'][] = ['supported', 'contradicted', 'ambiguous', 'insufficient_evidence', 'insufficient_evidence', 'ambiguous'];
  const relevant = [true, true, true, false, false, true];
  const annotations: EvidenceReview[] = experiment.cases.map((entry, index) => ({ ...review,
    controlId: entry.controlId, passage: resolveEvidenceCase(entry.id).passage,
    judgment: labels[index], relevance: relevant[index] ? 'relevant' : 'not_relevant', comment: 'Human annotation example.' }));
  assert.deepEqual(annotations.map((entry) => retrievePassages([entry.passage], evidenceControls[0]).length > 0), [true, true, true, false, true, false]);
  const retrieval = summarizeEvidence(annotations);
  assert.equal(retrieval.relevant, 4); assert.equal(retrieval.retrievedRelevant, 3); assert.equal(retrieval.missedRelevant, 1);
  assert.deepEqual(evaluateEvidenceRuns([run], annotations), evaluateEvidenceRuns([run], annotations.map((entry) => ({ ...entry, relevance: 'not_relevant' }))));
  assert.equal(evaluateEvidenceRuns([], annotations).n, 0);
  assert.equal(evaluateEvidenceRuns([], annotations).missingPredictions, 6);
});

test('confusion arithmetic excludes abstentions, counts false support and missed contradictions, and preserves error passages', () => {
  // Categorical arithmetic cases, not fabricated Jev API responses or dataset reference labels.
  const row = (expected: ComparisonRow['expected'], predicted: JudgmentCategory, caseId: string): ComparisonRow => ({ expected, predicted, caseId, runId: caseId, passage: recording.passage });
  const stats = scoreEvidenceRows([
    row('contradicted', 'supported', 'false-support'), row('supported', 'contradicted', 'false-contradiction'),
    row('ambiguous', 'ambiguous', 'ambiguous-agreement'), row('insufficient_evidence', 'supported', 'other-false-support'),
    row('uncertain', 'supported', 'abstention'), row(null, 'contradicted', 'unlabeled'),
  ]);
  assert.equal(stats.n, 4); assert.equal(stats.agreements, 1); assert.equal(stats.disagreements, 3);
  assert.equal(stats.agreementRate, 0.25); assert.equal(stats.excludedUnlabeled, 1); assert.equal(stats.excludedUncertain, 1);
  assert.equal(stats.falseSupport, 2); assert.equal(stats.missedContradictions, 1);
  assert.equal(stats.matrix.contradicted.supported, 1); assert.equal(stats.matrix.ambiguous.ambiguous, 1);
  assert.equal(stats.perCategory.find((entry) => entry.category === 'supported')!.falsePositives, 2);
  assert.equal(stats.errors[0].passage.text, recording.passage.text);
  assert.equal(scoreEvidenceRows([]).agreementRate, null);
});

test('recorded results round-trip exactly; latest case policy, edited reviews and actual-model filter are explicit', () => {
  const before = JSON.stringify(recording);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.deepEqual(readEvidenceRuns(storage), []);
  writeEvidenceRuns(storage, [run, { ...run, id: 'second-recorded-copy' }]);
  const restored = readEvidenceRuns(storage);
  assert.deepEqual(restored[0].result, recording);
  assert.equal(evaluateEvidenceRuns(restored, [review]).n, 1);
  assert.equal(evaluateEvidenceRuns(restored, [review]).rows[0].runId, 'second-recorded-copy');
  assert.equal(evaluateEvidenceRuns(restored, [review]).agreements, 1);
  assert.equal(evaluateEvidenceRuns(restored, [{ ...review, judgment: 'uncertain' }]).n, 0);
  assert.equal(evaluateEvidenceRuns(restored, [], 'unrecorded-model').missingPredictions, 6);
  const exported = JSON.parse(exportEvidenceExperiment(restored, [review]));
  assert.deepEqual(exported.runs[0].result.assessment.response, recording.assessment.response);
  assert.deepEqual(exported.humanReviewsAtExport, [review]);
  assert.equal(exported.experiment.id, experiment.id);
  assert.equal(JSON.stringify(recording), before);
  values.set(EVIDENCE_RUNS_KEY, '{broken'); assert.throws(() => readEvidenceRuns(storage));
  assert.throws(() => writeEvidenceRuns({ setItem: () => { throw new Error('Quota'); } }, [run]));
});

test('exports preserve reviewer snapshots and original source/config/model metadata; invalid snapshots are retained for recovery', () => {
  const snapshot: EvidenceReview = { ...review, judgment: 'ambiguous', comment: 'Independent pre-inference review example.' };
  const reviewedRun = { ...run, humanReviewAtRequest: snapshot };
  let raw = '';
  const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
  writeEvidenceRuns(storage, [reviewedRun]);
  const restored = readEvidenceRuns(storage);
  const exported = JSON.parse(exportEvidenceExperiment(restored, [{ ...snapshot, judgment: 'uncertain' }]));
  assert.deepEqual(exported.runs[0], reviewedRun);
  assert.deepEqual(exported.runs[0].result.assessment.request, recording.assessment.request);
  assert.deepEqual(exported.runs[0].result.assessment.response, recording.assessment.response);
  assert.equal(exported.runs[0].result.passage.revision, recording.passage.revision);
  assert.equal(exported.runs[0].result.controlId, recording.controlId);
  assert.equal(exported.runs[0].humanReviewAtRequest.judgment, 'ambiguous');
  assert.equal(exported.humanReviewsAtExport[0].judgment, 'uncertain');
  assert.equal(exported.classificationEvaluation.n, 0);
  assert.deepEqual(exported.questionConfiguration, recording.assessment.request.questions);
  for (const invalid of [undefined, { ...snapshot, controlId: 'other-control' },
    { ...snapshot, passage: resolveEvidenceCase('automatic-execution').passage }, { ...snapshot, judgment: 'invented-label' }]) {
    raw = JSON.stringify({ schemaVersion: 1, runs: [{ ...run, humanReviewAtRequest: invalid }] });
    const before = raw;
    assert.throws(() => readEvidenceRuns(storage)); assert.equal(raw, before);
  }
});

test('evidence API shares origin, body, key and inference protections; one action replays one real recording', async () => {
  const keys = ['JEV_LIVE_INFERENCE_ENABLED', 'JEV_ALLOWED_ORIGINS', 'JEV_TRUST_PROXY_HEADERS', 'TYPESAFE_API_KEY'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  let calls = 0;
  const handle = createEvidenceHandler(async (caseId: string, options: { live: boolean; signal: AbortSignal }) => {
    calls++; assert.equal(caseId, recording.caseId); assert.equal(options.live, true); return recording;
  });
  const request = (body: unknown, origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/evidence', {
    method: 'POST', headers: { origin, host: 'localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    for (const key of keys) delete process.env[key];
    process.env.JEV_LIVE_INFERENCE_ENABLED = 'true'; process.env.TYPESAFE_API_KEY = 'offline-test-key';
    for (const body of [{}, { caseId: 'unknown', live: true }, { caseId: recording.caseId },
      { caseId: recording.caseId, live: true, passage: 'tampered' }, { caseId: recording.caseId, live: true, model: 'injected' }]) {
      assert.equal((await handle(request(body))).status, 400);
    }
    const valid = { caseId: recording.caseId, live: true };
    assert.equal((await handle(request(valid, 'https://evil.example'))).status, 403);
    process.env.JEV_LIVE_INFERENCE_ENABLED = 'false'; assert.equal((await handle(request(valid))).status, 503);
    process.env.JEV_LIVE_INFERENCE_ENABLED = 'true'; process.env.TYPESAFE_API_KEY = ' '; assert.equal((await handle(request(valid))).status, 503);
    assert.equal(calls, 0); process.env.TYPESAFE_API_KEY = 'offline-test-key';
    const result = await handle(request(valid)); assert.deepEqual(await result.json(), recording); assert.equal(calls, 1);
  } finally { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
});
