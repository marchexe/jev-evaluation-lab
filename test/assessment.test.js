import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TypeSafeError } from '@typesafe-ai/sdk';
import { assessDescription, buildAssessmentRequest } from '../src/assessment.js';
import { questions } from '../src/questions.js';

const cases = JSON.parse(await readFile(new URL('../examples/governance/cases.json', import.meta.url), 'utf8'));

test('technical remains the default profile with its original questions and request shape', () => {
  const request = buildAssessmentRequest(' Example description ', { model: 'jev-latest' });
  assert.deepEqual(request, {
    model: 'jev-latest',
    state: { ai_system_description: 'Example description' },
    questions,
  });
  assert.deepEqual(request, buildAssessmentRequest('Example description', { profile: 'technical', model: 'jev-latest' }));
});

test('backend defaults to a serializable preview even when credentials are supplied', async () => {
  assert.equal(globalThis.fetch, undefined, 'Run with npm test to disable SDK network access.');
  const result = await assessDescription(cases[0].description, {
    profile: 'governance', apiKey: 'offline-secret',
  });
  assert.equal(result.mode, 'preview');
  assert.equal(result.profile, 'governance');
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.response, undefined);
  const serialized = JSON.stringify(result);
  assert.deepEqual(JSON.parse(serialized), result);
  assert.doesNotMatch(serialized, /offline-secret/);
});

test('governance preview includes all five SDK questions without inference', async () => {
  const preview = await assessDescription('Synthetic system.', { profile: 'governance' });
  assert.deepEqual(Object.keys(preview.request.questions), [
    'intended_use_case', 'supported_use_case', 'personal_data_evidence',
    'human_oversight_evidence', 'description_completeness',
  ]);
  assert.deepEqual(Object.values(preview.request.questions).map((question) => question.type),
    ['choice', 'noul', 'choice', 'choice', 'score']);
  assert.equal(preview.profile, 'governance');
  assert.equal(preview.mode, 'preview');
  assert.equal(preview.response, undefined);
});

test('invalid backend inputs cannot enter the live path', async () => {
  for (const description of ['', '  ', null, 42]) {
    await assert.rejects(assessDescription(description), /must not be empty/);
  }
  for (const profile of ['unknown', '__proto__']) {
    assert.throws(() => buildAssessmentRequest('Example', { profile }), /Unknown profile/);
  }
  assert.throws(() => buildAssessmentRequest('Example', { model: '' }), /nonempty string/);
  await assert.rejects(assessDescription('Example', { live: 'true' }), /must be a boolean/);
  await assert.rejects(assessDescription('Example', { live: true, apiKey: '' }), /Set TYPESAFE_API_KEY/);
  await assert.rejects(assessDescription('Example', { live: true, apiKey: 'offline-secret' }), TypeSafeError);
});

test('request edits cannot alter later requests or the technical profile', () => {
  const first = buildAssessmentRequest('Example', { profile: 'governance' });
  first.questions.personal_data_evidence.criteria.not_documented = 'changed';
  const second = buildAssessmentRequest('Example', { profile: 'governance' });
  assert.notEqual(second.questions.personal_data_evidence.criteria.not_documented, 'changed');
  assert.deepEqual(buildAssessmentRequest('Example').questions, questions);
});

test('15 synthetic descriptions cover all domains and produce offline requests without annotations', async () => {
  assert.equal(cases.length, 15);
  assert.equal(new Set(cases.map((entry) => entry.id)).size, 15);
  for (const domain of ['hr', 'finance', 'education', 'customer_support', 'ambiguous']) {
    assert.equal(cases.filter((entry) => entry.domain === domain).length, 3);
  }
  for (const entry of cases) {
    assert.equal(typeof entry.reviewFocus, 'string');
    const preview = await assessDescription(entry.description, { profile: 'governance' });
    assert.deepEqual(preview.request.state, { ai_system_description: entry.description });
    assert.equal(preview.response, undefined);
    assert.doesNotMatch(JSON.stringify(preview.request), /reviewFocus/);
  }
});
