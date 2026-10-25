import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompareView } from '../components/LabViews';
import { compareAssessments, difference } from '../src/ui/comparison';
import { evaluateRecords } from '../src/ui/evaluation';
import { createRecord, exportHistory, HISTORY_KEY, readHistory, writeHistory } from '../src/ui/history';
import { updateFieldReview } from '../src/ui/reviews';
import type { Assessment, AssessmentRecord, FieldReview } from '../src/ui/types';

const recording: Assessment = JSON.parse(await readFile(new URL('./fixtures/jev-1.14.0-governance-recorded.json', import.meta.url), 'utf8'));
const record = (id: string) => createRecord(structuredClone(recording), id);

test('comparison calculates every probability delta without rounding or treating missing as zero', () => {
  const a = record('a'); const b = record('b');
  // Deliberate arithmetic variations of a recording, not simulated API inference.
  const choice = b.assessment.response.answers.intended_use_case;
  assert.equal(choice.type, 'choice');
  if (choice.type !== 'choice') throw new Error('Fixture must be Choice');
  choice.choice = 'finance_operations'; choice.probabilities.hr_recruitment = 0.6000000000000001;
  choice.probabilities.finance_operations = 0.3999999999999999;
  choice.probabilities.new_option = 0;
  const noul = b.assessment.response.answers.supported_use_case;
  if (noul.type === 'noul') noul.noul = 0.5;
  const score = b.assessment.response.answers.description_completeness;
  if (score.type === 'score') { score.score = 2.1; score.probabilities['2'] = 0.9; score.probabilities['3'] = 0.1; }
  b.assessment.latencyMs = 400; b.assessment.response.usage.input_tokens = null;
  const snapshot = JSON.stringify([a, b]);
  const comparison = compareAssessments(a.assessment, b.assessment);
  const field = comparison.fields.find((entry) => entry.name === 'intended_use_case')!;
  assert.equal(field.status, 'missing');
  assert.equal(field.prediction.status, 'changed');
  assert.equal(field.probabilities.find((entry) => entry.label === 'hr_recruitment')!.delta, 0.6000000000000001 - 1);
  assert.deepEqual(field.probabilities.find((entry) => entry.label === 'new_option'), { label: 'new_option', left: null, right: 0, delta: null, status: 'missing' });
  assert.equal(comparison.fields.find((entry) => entry.name === 'supported_use_case')!.prediction.delta, 0.5 - 0.99);
  assert.equal(comparison.fields.find((entry) => entry.name === 'description_completeness')!.prediction.delta, 2.1 - 2.99);
  assert.equal(comparison.latencyMs.delta, 400 - 365.55);
  assert.equal(comparison.inputTokens.status, 'missing');
  assert.equal(comparison.inputTokens.delta, null);
  assert.equal(difference(0, 0).status, 'unchanged');
  assert.equal(JSON.stringify([a, b]), snapshot);
});

test('comparison distinguishes unchanged fields, missing answers, type and definition changes', () => {
  const a = record('a'); const b = record('b');
  assert.ok(compareAssessments(a.assessment, b.assessment).fields.every((field) => field.status === 'unchanged'));
  delete b.assessment.response.answers.personal_data_evidence;
  b.assessment.response.answers.supported_use_case = { type: 'score', score: 0.99, legend: { 0: 'none', 1: 'some' }, probabilities: { 0: 0.01, 1: 0.99 } };
  b.assessment.request.questions.description_completeness.instructions = 'Different question';
  const result = compareAssessments(a.assessment, b.assessment);
  assert.equal(result.fields.find((field) => field.name === 'personal_data_evidence')!.status, 'missing');
  const mismatch = result.fields.find((field) => field.name === 'supported_use_case')!;
  assert.equal(mismatch.status, 'type_mismatch'); assert.equal(mismatch.prediction.delta, null);
  assert.equal(result.fields.find((field) => field.name === 'description_completeness')!.definitionChanged, true);
});

test('known categorical values are not mislabeled as missing numeric data', () => {
  const html = renderToStaticMarkup(<CompareView records={[record('a'), record('b')]} />);
  assert.match(html, /Categorical values have no numeric delta/);
  const a = record('a'); const b = record('b');
  const choice = b.assessment.response.answers.intended_use_case;
  if (choice.type === 'choice') choice.confidence = null;
  assert.equal(compareAssessments(a.assessment, b.assessment).fields[0].status, 'missing');
});

test('field reviews edit and clear independently without changing Jev data or overall feedback', () => {
  const original = record('a'); const before = JSON.stringify(original.assessment);
  let records = updateFieldReview([original], 'a', 'intended_use_case', { judgment: 'correct', comment: 'Human check.', expectedChoice: 'hr_recruitment' });
  records = updateFieldReview(records, 'a', 'supported_use_case', { judgment: 'uncertain', comment: 'Evidence is incomplete.', noulJudgment: 'unresolved' });
  records = updateFieldReview(records, 'a', 'intended_use_case', { judgment: 'incorrect', comment: 'Revised.', expectedChoice: 'finance_operations' });
  assert.equal(records[0].fieldReviews!.intended_use_case.comment, 'Revised.');
  assert.equal(records[0].assessment, original.assessment);
  assert.equal(JSON.stringify(records[0].assessment), before);
  assert.deepEqual(records[0].feedback, original.feedback);
  records = updateFieldReview(records, 'a', 'intended_use_case', null);
  assert.equal(records[0].fieldReviews!.intended_use_case, undefined);
  assert.equal(records[0].fieldReviews!.supported_use_case.noulJudgment, 'unresolved');
  assert.equal(original.fieldReviews, undefined);
});

test('review validation rejects invalid categories, levels, types and numeric Noul ground truth', () => {
  const records = [record('a')];
  for (const [field, review] of [
    ['intended_use_case', { judgment: 'correct', comment: '', expectedChoice: 'invented' }],
    ['description_completeness', { judgment: 'correct', comment: '', expectedScore: 4 }],
    ['description_completeness', { judgment: 'correct', comment: '', expectedScore: 1.5 }],
    ['supported_use_case', { judgment: 'correct', comment: '', expectedScore: 1 }],
    ['supported_use_case', { judgment: 'correct', comment: '', numericGroundTruth: 0.9 }],
    ['intended_use_case', { judgment: 'correct', comment: 'x'.repeat(1001) }],
  ] as const) assert.throws(() => updateFieldReview(records, 'a', field, review as unknown as FieldReview));
  assert.throws(() => updateFieldReview(records, 'missing', 'intended_use_case', null));
  assert.throws(() => updateFieldReview(records, 'a', 'missing', null));
});

test('statistics use only manual field reviews, explicit expected targets and reported metadata', () => {
  const a = record('a'); const b = record('b'); const unreviewed = record('c');
  const bChoice = b.assessment.response.answers.intended_use_case;
  if (bChoice.type === 'choice') bChoice.choice = 'finance_operations';
  b.assessment.latencyMs = 400; b.assessment.response.usage.input_tokens = null;
  unreviewed.feedback.rating = 'positive'; unreviewed.assessment.latencyMs = 999999;
  let records: AssessmentRecord[] = [a, b, unreviewed];
  records = updateFieldReview(records, 'a', 'intended_use_case', { judgment: 'correct', comment: '', expectedChoice: 'hr_recruitment' });
  records = updateFieldReview(records, 'b', 'intended_use_case', { judgment: 'incorrect', comment: '', expectedChoice: 'hr_recruitment' });
  records = updateFieldReview(records, 'b', 'personal_data_evidence', { judgment: 'uncertain', comment: '' });
  records = updateFieldReview(records, 'a', 'description_completeness', { judgment: 'incorrect', comment: '', expectedScore: 2 });
  records = updateFieldReview(records, 'b', 'description_completeness', { judgment: 'correct', comment: '', expectedScore: 3 });
  records = updateFieldReview(records, 'a', 'supported_use_case', { judgment: 'uncertain', comment: '', noulJudgment: 'unresolved' });
  const stats = evaluateRecords(records);
  assert.equal(stats.reviewedAssessments, 2); assert.equal(stats.savedAssessments, 3);
  assert.deepEqual(stats.choiceAgreement, { matches: 1, n: 2, rate: 0.5, withoutExpected: 1 });
  assert.equal(stats.scoreAbsoluteError.n, 2); assert.equal(stats.scoreAbsoluteError.mean, 0.5);
  assert.deepEqual(stats.fields.intended_use_case, { correct: 1, incorrect: 1, uncertain: 0, total: 2 });
  assert.equal(stats.fields.supported_use_case.uncertain, 1);
  assert.equal(stats.latencyMs.n, 2); assert.equal(stats.latencyMs.max, 400);
  assert.equal(stats.inputTokens.n, 1); assert.equal(stats.inputTokens.mean, 1251);
  assert.equal(evaluateRecords([unreviewed]).choiceAgreement.rate, null);
  assert.equal(evaluateRecords([unreviewed]).scoreAbsoluteError.mean, null);
  assert.equal(evaluateRecords([unreviewed]).latencyMs.n, 0);
  const zero = updateFieldReview([a], 'a', 'description_completeness', { judgment: 'incorrect', comment: '', expectedScore: 0 });
  assert.equal(evaluateRecords(zero).scoreAbsoluteError.mean, 2.99);
});

test('legacy history, new reviews and exports round-trip with original numeric precision', () => {
  let raw = JSON.stringify([record('old')]);
  const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
  const legacy = readHistory(storage);
  assert.equal(legacy[0].fieldReviews, undefined);
  const reviewed = updateFieldReview(legacy, 'old', 'description_completeness', { judgment: 'correct', comment: '', expectedScore: 3 });
  writeHistory(storage, reviewed);
  const restored = readHistory(storage);
  assert.deepEqual(restored[0].assessment, recording);
  const exported = JSON.parse(exportHistory(restored));
  assert.equal(exported.schemaVersion, 2);
  assert.equal(exported.assessments[0].assessment.response.answers.description_completeness.score, 2.99);
  assert.equal(exported.assessments[0].assessment.response.answers.description_completeness.probabilities['2'], 0.01);
  assert.equal(exported.assessments[0].fieldReviews.description_completeness.expectedScore, 3);
});

test('history uses only its own storage key and rejects unsupported profiles', () => {
  const values = new Map<string, string>();
  const unrelated = JSON.stringify([record('unrelated')]);
  values.set('another-tool.assessments', unrelated);
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.deepEqual(readHistory(storage), []);
  const saved = [record('saved')];
  writeHistory(storage, saved);
  assert.deepEqual(readHistory(storage), saved);
  assert.equal(values.get('another-tool.assessments'), unrelated);
  writeHistory(storage, []);
  assert.deepEqual(readHistory(storage), []);
  const invalid = record('invalid');
  invalid.assessment.profile = 'unsupported';
  values.set(HISTORY_KEY, JSON.stringify([invalid]));
  assert.throws(() => readHistory(storage), /invalid/);
  values.set(HISTORY_KEY, '{invalid');
  assert.throws(() => readHistory(storage));
});
