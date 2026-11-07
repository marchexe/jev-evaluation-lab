import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { defaultConfigurations, validateQuestionConfiguration } from '../src/question-config.js';
import { assessDescription } from '../src/assessment.js';
import { judgeEvidence } from '../src/server/evidence-assessment';
import { createAssessmentHandler } from '../src/server/assessment-route.js';
import { createEvidenceHandler } from '../src/server/evidence-route.js';
import { validateAssessment, importAssessmentHistory, importEvidenceExperiment, parseImport } from '../src/ui/import-export';
import { createRecord, exportHistory } from '../src/ui/history';
import { evaluateEvidenceRuns, exportEvidenceExperiment, validateEvidenceResult, type EvidenceResult } from '../src/ui/evidence-runs';
import { hashJson, hashSource } from '../src/retrieval-evaluation';
import type { Assessment } from '../src/ui/types';

const read = async (file: string) => JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'));
const governance: Assessment = await read('./fixtures/jev-1.14.0-governance-recorded.json');
const evidence: EvidenceResult = await read('./fixtures/jev-evidence-approval-recorded.json');
const alternative: EvidenceResult = await read('./fixtures/jev-evidence-config-recorded.json');
const governanceSmoke: Assessment = await read('./fixtures/jev-governance-config-recorded.json');

test('question editing preserves typed identities and requires a new default version; malformed imports cannot execute', async () => {
  for (const kind of ['governance', 'evidence'] as const) {
    const base = structuredClone(defaultConfigurations[kind]); validateQuestionConfiguration(base, kind);
    const changed: any = structuredClone(base); const key = Object.keys(changed.questions)[0];
    changed.questions[key].instructions += ' Use documented facts only.';
    assert.throws(() => validateQuestionConfiguration(changed, kind), /different version/);
    changed.version = 'independent-experiment-1'; validateQuestionConfiguration(changed, kind);
    const result = kind === 'governance' ? await assessDescription('Synthetic system.', { profile: 'governance', questionConfiguration: changed })
      : await judgeEvidence('approval-gate', { questionConfiguration: changed });
    if (!('request' in result)) throw new Error('Expected preview, not a live result.');
    assert.equal(result.mode, 'preview'); assert.deepEqual(result.request.questions, changed.questions);
    assert.deepEqual(defaultConfigurations[kind], base);
    for (const edit of [
      (v: any) => { v.endpoint = 'https://evil.example'; }, (v: any) => { v.questions[key].type = 'box'; },
      (v: any) => { delete v.questions[key]; }, (v: any) => { v.questions[key].instructions = 'x'.repeat(2001); },
      (v: any) => { v.questions[key].criteria.unrecognized = 'Other'; },
    ]) { const bad = structuredClone(changed); edit(bad); assert.throws(() => validateQuestionConfiguration(bad, kind)); }
  }
});

test('recorded alternative questions round-trip and evaluation never silently pools changed configuration content', () => {
  const original = JSON.stringify(alternative);
  validateEvidenceResult(alternative); validateAssessment(alternative.assessment);
  validateAssessment(governanceSmoke);
  const runs = [{ id: 'original', result: evidence, humanReviewAtRequest: null }, { id: 'alternative', result: alternative, humanReviewAtRequest: null }];
  assert.equal(evaluateEvidenceRuns(runs, []).rows[0].runId, 'original');
  assert.equal(evaluateEvidenceRuns(runs, [], '', alternative.questionConfiguration).rows[0].runId, 'alternative');
  const rekeyed = structuredClone(alternative); rekeyed.questionConfiguration!.questions.evidence_judgment.instructions += ' Changed.';
  assert.throws(() => validateEvidenceResult(rekeyed));
  assert.equal(JSON.stringify(alternative), original);
});

test('history import validates original responses, is idempotent, rejects conflicts and preserves fractional precision', () => {
  const original = JSON.stringify(governance), record = createRecord(governance, 'recorded-import');
  const packet = JSON.parse(exportHistory([record]));
  assert.deepEqual(importAssessmentHistory(packet), [record]);
  assert.deepEqual(importAssessmentHistory(packet, [record]), [record]);
  const conflict = structuredClone(packet); conflict.assessments[0].feedback.comment = 'different';
  assert.throws(() => importAssessmentHistory(conflict, [record]), /Conflicting/);
  for (const edit of [
    (v: any) => { v.assessments.push(v.assessments[0]); },
    (v: any) => { v.assessments[0].assessment.response.answers.description_completeness.score = 4; },
    (v: any) => { v.assessments[0].assessment.response.usage.input_tokens = -1; },
    (v: any) => { v.assessments[0].assessment.response.answers.supported_use_case.noul = '0.5'; },
    (v: any) => { delete v.assessments[0].assessment.response.usage.output_tokens; },
  ]) { const bad = structuredClone(packet); edit(bad); assert.throws(() => importAssessmentHistory(bad)); }
  assert.throws(() => parseImport('x'.repeat(2_000_001))); assert.throws(() => parseImport('{invalid'));
  assert.equal(JSON.stringify(governance), original);
});

test('evidence imports restore real runs and independent reviews, ignore derived statistics and reject source/configuration conflicts', () => {
  const run = { id: 'recorded-evidence-import', result: alternative, humanReviewAtRequest: null };
  const review = { controlId: evidence.controlId, passage: evidence.passage, judgment: 'uncertain' as const,
    relevance: 'uncertain' as const, comment: 'Unresolved human review.', updatedAt: '2026-11-07T12:00:00Z' };
  const packet = JSON.parse(exportEvidenceExperiment([run], [review]));
  packet.classificationEvaluation.agreementRate = 1; // Imported derived claims never become statistics.
  assert.deepEqual(importEvidenceExperiment(packet), { runs: [run], reviews: [review] });
  assert.deepEqual(importEvidenceExperiment(packet, [run], [review]), { runs: [run], reviews: [review] });
  assert.equal(evaluateEvidenceRuns([run], [review], '', alternative.questionConfiguration).n, 0);
  assert.throws(() => importEvidenceExperiment(packet, [], [{ ...review, comment: 'Conflicting label.' }]), /Conflicting review/);
  const bad = structuredClone(packet); bad.runs[0].result.passage.text = 'forged'; assert.throws(() => importEvidenceExperiment(bad));
  const foreign = structuredClone(packet); foreign.experiment.id = 'other'; assert.throws(() => importEvidenceExperiment(foreign));
});

test('custom-question API validation precedes inference, preserves origin controls and forwards valid wording exactly once', async () => {
  const names = ['TYPESAFE_API_KEY', 'JEV_LIVE_INFERENCE_ENABLED']; const before = names.map((n) => process.env[n]);
  let calls = 0;
  try {
    process.env.TYPESAFE_API_KEY = 'offline-test-key'; process.env.JEV_LIVE_INFERENCE_ENABLED = 'true';
    const handlers = [createAssessmentHandler(async (_: string, opts: any) => { calls++; assert.deepEqual(opts.questionConfiguration, defaultConfigurations.governance); return governance; }),
      createEvidenceHandler(async (_: string, opts: any) => { calls++; assert.deepEqual(opts.questionConfiguration, alternative.questionConfiguration); return alternative; })];
    const packets = [{ description: 'Synthetic description.', live: true, questionConfiguration: defaultConfigurations.governance },
      { caseId: 'approval-gate', live: true, questionConfiguration: alternative.questionConfiguration }];
    for (let i = 0; i < 2; i++) {
      const request = (body: any, origin = 'https://lab.example') => new Request('https://lab.example/api/test', { method: 'POST', headers: { origin, host: 'lab.example', 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const bad = structuredClone(packets[i]); bad.questionConfiguration.version = 'bad version';
      assert.equal((await handlers[i](request(bad))).status, 400);
      assert.equal((await handlers[i](request(packets[i], 'https://evil.example'))).status, 403);
      process.env.JEV_LIVE_INFERENCE_ENABLED = 'false'; assert.equal((await handlers[i](request(packets[i]))).status, 503);
      process.env.JEV_LIVE_INFERENCE_ENABLED = 'true'; assert.equal((await handlers[i](request(packets[i]))).status, 200);
    }
    assert.equal(calls, 2);
  } finally { names.forEach((n, i) => { if (before[i] === undefined) delete process.env[n]; else process.env[n] = before[i]; }); }
});

test('all published real study responses match frozen requests, contain native distributions and preserve usage totals', async () => {
  const protocol = await read('../examples/evidence/jev-study/protocol.json'); assert.equal(hashJson(protocol.payload), protocol.hash);
  assert.equal(hashSource(await readFile(new URL('../examples/evidence/jev-study/runner-at-recording.ts.txt', import.meta.url), 'utf8')), protocol.payload.sourceHashes.runner);
  let input = 0, output = 0;
  for (const [i, item] of protocol.payload.cases.entries()) for (const [v, config] of protocol.payload.configurations.entries()) {
    const row = await read(`../examples/evidence/jev-study/recorded/${String(i + 1).padStart(2, '0')}-${v + 1}.json`);
    assert.equal(row.protocolHash, protocol.hash); assert.equal(row.caseId, item.id); assert.equal(row.requestHash, hashJson(row.assessment.request));
    assert.deepEqual(row.configuration, config); assert.deepEqual(row.assessment.request.state.passage, item.passage);
    assert.deepEqual(row.assessment.request.questions, config.questions);
    assert.equal(row.assessment.response.model, protocol.payload.model); validateAssessment(row.assessment);
    input += row.assessment.response.usage.input_tokens; output += row.assessment.response.usage.output_tokens;
  }
  const report = await read('../examples/evidence/jev-study/recorded/analysis.json');
  assert.equal(report.completedRequests, 58); assert.equal(report.usage.inputTokens, input); assert.equal(report.usage.outputTokens, output);
});

test('agent CLI previews and validates offline without reading a key into output or making inference', () => {
  const execute = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', '--import', './test-support/offline.js', 'scripts/lab.ts', ...args], { encoding: 'utf8', timeout: 30000 });
  const preview = execute('evidence', '--case', 'approval-gate'); assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).mode, 'preview'); assert.doesNotMatch(preview.stdout, /TYPESAFE_API_KEY/);
  const validation = execute('validate', '--kind', 'governance-questions', '--input', 'examples/questions/governance.json'); assert.equal(validation.status, 0, validation.stderr);
  assert.notEqual(execute('evidence', '--case', 'unknown').status, 0);
});
