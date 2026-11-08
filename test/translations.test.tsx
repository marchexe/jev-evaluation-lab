import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { TranslatedText } from '../components/TranslatedText';
import { SourceDocument } from '../components/SourceDocument';
import { JevAnswerField } from '../components/JevAssessmentCard';
import type { JevAnswer } from '../src/ui/types';
import { translationFor } from '../components/translations';
import { searchDocuments, searchPassages } from '../src/ui/evidence';
import cases from '../examples/governance/cases.json';
import relations from '../examples/evidence/graph-relations.json';
import { defaultConfigurations } from '../src/question-config.js';

test('all bundled documents, passages, examples, source quotes and default questions have display translations', () => {
  for (const doc of searchDocuments) {
    assert.ok(translationFor(doc.title), doc.title);
    assert.ok(translationFor(doc.content), doc.id + '@' + doc.revision);
  }
  for (const passage of searchPassages) {
    assert.ok(translationFor(passage.text), passage.id);
    assert.ok(translationFor(passage.section), passage.section);
  }
  for (const example of cases) assert.ok(translationFor(example.description), example.id);
  for (const relation of relations.relationships) assert.ok(translationFor(relation.source.quote), relation.id);
  for (const config of Object.values(defaultConfigurations)) for (const question of Object.values(config.questions)) {
    assert.ok(translationFor(question.instructions), question.instructions);
    for (const criterion of Object.values(question.criteria)) assert.ok(translationFor(String(criterion)), String(criterion));
  }
});

test('recorded question criteria and score legends are translated without mutating responses or source references', async () => {
  for (const fixture of ['jev-1.14.0-governance-recorded.json','jev-evidence-approval-recorded.json','jev-evidence-config-recorded.json']) {
    const bytes = await readFile(new URL('./fixtures/' + fixture, import.meta.url), 'utf8');
    const result = JSON.parse(bytes), assessment = result.assessment ?? result;
    const before = JSON.stringify(result);
    for (const q of Object.values(assessment.request.questions) as { instructions: string; criteria: Record<string,string> | string[] }[]) {
      assert.ok(translationFor(q.instructions), q.instructions);
      for (const text of Object.values(q.criteria)) assert.ok(translationFor(text), text);
    }
    for (const answer of Object.values(assessment.response.answers) as { legend?: Record<string,string> }[]) {
      for (const text of Object.values(answer.legend ?? {})) assert.ok(translationFor(text), text);
    }
    renderToStaticMarkup(<TranslatedText text={result.passage?.text ?? assessment.request.state.ai_system_description} />);
    assert.equal(JSON.stringify(result), before);
    assert.equal(await readFile(new URL('./fixtures/' + fixture, import.meta.url), 'utf8'), bytes);
  }
});

test('display has no original toggle and preserves unknown text and editable question fields', () => {
  const text = 'A staff member must countersign each proposal before it leaves the queue.';
  const html = renderToStaticMarkup(<TranslatedText text={text} />);
  assert.match(html, /bevor er die Warteschlange verlässt/);
  assert.doesNotMatch(html, /<button|original-copy|aria-expanded/);
  assert.ok(!html.includes(text));
  const editable = renderToStaticMarkup(<TranslatedText text={text} original={<textarea defaultValue={text} />} />);
  assert.match(editable, /<textarea/);
  assert.ok(editable.includes(text));
  assert.equal(translationFor(text + ' Changed.'), null);
  assert.equal(translationFor('Unseen external document.'), null);
  const unknown = renderToStaticMarkup(<TranslatedText text="Unseen external document." />);
  assert.doesNotMatch(unknown, /<button|original-copy/);
  assert.match(unknown, /Unseen external document\./);
});

test('Score rubric uses German display text without changing the recorded legend', async () => {
  const recorded = JSON.parse(await readFile(new URL('./fixtures/jev-1.14.0-governance-recorded.json', import.meta.url), 'utf8'));
  const answer = recorded.response.answers.description_completeness as JevAnswer;
  const before = JSON.stringify(answer);
  const html = renderToStaticMarkup(<JevAnswerField name="description_completeness" answer={answer} />);
  assert.match(html, /Die Beschreibung nennt einen Namen/);
  assert.doesNotMatch(html, /The description gives/);
  assert.equal(JSON.stringify(answer), before);
});

test('bundled documents render translated headings and paragraphs without raw Markdown', () => {
  const doc = searchDocuments.find(entry => entry.id === 'dispatch-gates' && entry.revision === '2')!;
  const html = renderToStaticMarkup(<SourceDocument content={doc.content} />);
  assert.match(html, /<h4>Dispatch-Freigaberegister<\/h4>/);
  assert.match(html, /<h5>/);
  assert.doesNotMatch(html, /# Dispatch|\[Queue gate\]|This register calls|<pre/);
  assert.match(html, /evidence:dispatch-signoff@1/);
});
