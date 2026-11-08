import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { openJev, openReview, evaluateEvidence } from './workflows';

const study = JSON.parse(await readFile(new URL('../examples/evidence/jev-study/recorded/15-1.json', import.meta.url), 'utf8'));
const state = study.assessment.request.state;
// Replay the exact recorded SDK exchange; only the local Explorer envelope/profile is new.
const recording = { schemaVersion: 1, experimentId: 'evidence-explorer-1', datasetVersion: 'synthetic-oversight-graph-1',
  caseId: `corpus:${encodeURIComponent(state.control.id)}:${encodeURIComponent(state.passage.id)}`,
  controlId: state.control.id, passage: state.passage, questionVersion: study.configuration.version, questionConfiguration: study.configuration,
  assessment: { ...study.assessment, profile: 'evidence' },
  recordingSource: { file: 'examples/evidence/jev-study/recorded/15-1.json', normalization: 'New Explorer envelope; application profile evidence-study -> evidence. Original SDK request, response and inference metadata unchanged.' } };
const oldRecording = JSON.parse(await readFile(new URL('../test/fixtures/jev-evidence-approval-recorded.json', import.meta.url), 'utf8'));

test('graph-only source can be reviewed, explicitly judged from a real recording, restored and exported without changing raw data', async ({ page }) => {
  let calls = 0;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/evidence', async route => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({ passageId: recording.passage.id, controlId: recording.controlId, live: true });
    await route.fulfill({ json: recording });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Belege', exact: true }).click();
  await page.getByRole('button', { name: `Inspect source result ${recording.passage.id}`, exact: true }).click();
  const inspector = page.locator('#passage-inspector');
  await expect(inspector).toContainText('ohne Gegenzeichnung');
  await openReview(inspector);
  await inspector.getByLabel('Belegaussage').selectOption('contradicted');
  await inspector.getByLabel('Suchrelevanz').selectOption('relevant');
  await inspector.getByRole('button', { name: 'Bewertung speichern' }).click();
  await openJev(page); expect(calls).toBe(0);
  const judge = page.getByRole('button', { name: 'Mit Jev bewerten', exact: true });
  await expect(judge).toBeEnabled(); await judge.click();
  const result = page.getByRole('region', { name: 'Selected Jev result' });
  await expect(result).toContainText(recording.assessment.requestId!);
  await expect(result).toContainText('Aufzeichnung · kein neuer Jev-Aufruf.');
  const panel = page.getByRole('region', { name: 'Jev-Belegbewertung', exact: true });
  const downloaded = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Experiment exportieren' }).click();
  const exportedPath = (await (await downloaded).path())!;
  const exported = JSON.parse(await readFile(exportedPath, 'utf8'));
  expect(exported.runs[0].result).toEqual(recording);
  expect(exported.runs[0].humanReviewAtRequest.judgment).toBe('contradicted');
  expect(exported.corpus.documents.some((doc: { id: string }) => doc.id === 'dispatch-gates')).toBe(true);
  expect(exported.classificationEvaluation.n).toBe(1);
  expect(exported.classificationEvaluation.missingPredictions).toBe(6);
  await page.reload(); await page.getByRole('button', { name: 'Belege', exact: true }).click();
  await page.getByRole('button', { name: `Inspect source result ${recording.passage.id}`, exact: true }).click();
  await openJev(page); await expect(result).toContainText(recording.assessment.requestId!);
  await panel.locator('.run-management > summary').click();
  await panel.getByLabel('Experiment importieren (JSON)').setInputFiles(exportedPath);
  await expect(panel.getByRole('status')).toContainText('Experiment importiert');
  await page.screenshot({ path: 'results/evidence-demo/graph-judgment.png', fullPage: true });
  await evaluateEvidence(page);
  await expect(panel).toContainText('zusätzliche bewertete Abschnitte: 1');
  expect(calls).toBe(1); expect(errors).toEqual([]);
});

test('a response for a different source is rejected and the production selector route retains security protections', async ({ page, request }) => {
  await page.route('**/api/evidence', route => route.fulfill({ json: oldRecording }));
  await page.goto('/'); await page.getByRole('button', { name: 'Belege', exact: true }).click();
  await page.getByRole('button', { name: `Inspect source result ${recording.passage.id}`, exact: true }).click();
  await openJev(page); await page.getByRole('button', { name: 'Mit Jev bewerten' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Antwort passt nicht' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Selected Jev result' })).toHaveCount(0);
  const data = { passageId: recording.passage.id, controlId: recording.controlId, live: true };
  expect((await request.post('http://127.0.0.1:3198/api/evidence', { data })).status()).toBe(503);
  expect((await request.post('/api/evidence', { data })).status()).toBe(503);
  expect((await request.post('/api/evidence', { data, headers: { origin: 'https://evil.example' } })).status()).toBe(403);
  expect((await request.post('/api/evidence', { data: { ...data, passage: recording.passage } })).status()).toBe(400);
});

test('prepared four-recording demo imports and exports offline without adding human labels', async ({ page }, info) => {
  const output = info.outputPath('recorded-demo.json');
  execFileSync(process.execPath, ['--import', 'tsx', '--import', './test-support/offline.js', 'scripts/prepare-evidence-demo.ts', '--output', output]);
  const packet = JSON.parse(await readFile(output, 'utf8'));
  let calls = 0; await page.route('**/api/**', async route => { calls++; await route.abort(); });
  await page.goto('http://127.0.0.1:3198'); await page.getByRole('button', { name: 'Belege', exact: true }).click();
  await openJev(page);
  const panel = page.getByRole('region', { name: 'Jev-Belegbewertung', exact: true });
  await panel.locator('.run-management > summary').click();
  await panel.getByLabel('Experiment importieren (JSON)').setInputFiles(output);
  await expect(panel).toContainText('4 gespeicherte Läufe');
  await page.getByRole('button', { name: `Inspect source result ${recording.passage.id}`, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Selected Jev result' })).toContainText(recording.assessment.requestId);
  const download = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Experiment exportieren' }).click();
  const exported = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(exported.runs).toEqual(packet.runs);
  expect(exported.humanReviewsAtExport).toEqual([]);
  expect(exported.classificationEvaluation.n).toBe(0);
  expect(exported.classificationEvaluation.excludedUnlabeled).toBe(4);
  expect(exported.classificationEvaluation.missingPredictions).toBe(3);
  expect(exported.classificationEvaluation.additionalPassages).toBe(1);
  expect(calls).toBe(0);
});
