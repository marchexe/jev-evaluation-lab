import React from 'react';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { JevAnswerField, JevAssessmentCard } from '../components/JevAssessmentCard';
import { createRecord, exportHistory, HISTORY_KEY, readHistory, updateFeedback, writeHistory } from '../src/ui/history';
import type { Assessment } from '../src/ui/types';

const recording: Assessment = JSON.parse(await readFile(new URL('./fixtures/jev-1.14.0-governance-recorded.json', import.meta.url), 'utf8'));

test('recorded Jev Choice, Noul, and fractional Score render original values and all options', () => {
  const before = JSON.stringify(recording);
  const html = renderToStaticMarkup(<JevAssessmentCard assessment={recording} assessmentId="recorded-assessment" />);
  assert.match(html, /hr_recruitment/);
  assert.match(html, /0\.99/);
  assert.match(html, /2\.99/);
  assert.match(html, /0\.01/);
  assert.match(html, /no yes\/no threshold applied/);
  assert.match(html, /<meter/);
  assert.match(html, /<details/);
  for (const answer of Object.values(recording.response.answers)) {
    if (answer.type !== 'noul') {
      for (const label of Object.keys(answer.probabilities)) assert.ok(html.includes(label));
    }
    if (answer.type === 'score') for (const rubric of Object.values(answer.legend)) assert.ok(html.includes(String(rubric)));
  }
  for (const value of [recording.response.model, recording.requestId, recording.latencyMs,
    recording.response.usage.input_tokens, recording.response.usage.output_tokens]) assert.ok(html.includes(String(value)));
  assert.equal(JSON.stringify(recording), before);
});

test('native evidence alternatives include missing, unclear, conflicting and explicit negative states', () => {
  for (const name of ['personal_data_evidence', 'human_oversight_evidence']) {
    const answer = recording.response.answers[name];
    const html = renderToStaticMarkup(<JevAnswerField name={name} answer={answer} />);
    for (const state of ['not_documented', 'unclear', 'conflicting']) assert.ok(html.includes(state));
    assert.ok(html.includes(name === 'personal_data_evidence' ? 'explicitly_excluded' : 'explicitly_absent'));
  }
});

test('exact numerical values round-trip through browser persistence, feedback and history export', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const first = createRecord(recording, 'assessment-a');
  const second = createRecord(recording, 'assessment-b');
  let records = [first, second];
  writeHistory(storage, records);
  assert.deepEqual(readHistory(storage), records);
  records = updateFeedback(records, first.id, { rating: 'negative', comment: 'Recorded fixture review only.' });
  assert.deepEqual(records[1].feedback, second.feedback);
  assert.deepEqual(records[0].assessment, recording);
  assert.equal(first.feedback.rating, 'not_rated');
  writeHistory(storage, records);
  const restored = readHistory(storage);
  assert.equal(restored[0].feedback.rating, 'negative');
  const exported = JSON.parse(exportHistory(restored));
  assert.deepEqual(exported.assessments[0].assessment, recording);
  assert.equal(exported.assessments[0].assessment.response.answers.description_completeness.score, 2.99);
  assert.equal(exported.assessments[0].assessment.response.answers.description_completeness.probabilities['2'], 0.01);
  assert.equal(exported.assessments[0].id, first.id);
  assert.equal(exported.assessments[0].timestamp, recording.startedAt);
  assert.ok(values.has(HISTORY_KEY));
});

test('corrupt storage and write errors are surfaced without silently deleting history', () => {
  assert.throws(() => readHistory({ getItem: () => '{invalid' }));
  assert.throws(() => readHistory({ getItem: () => '[{}]' }), /invalid/);
  assert.throws(() => writeHistory({ setItem: () => { throw new Error('Quota exceeded'); } }, []), /Quota exceeded/);
});
