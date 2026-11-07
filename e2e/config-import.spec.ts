import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const governance = JSON.parse(await readFile(new URL('../test/fixtures/jev-1.14.0-governance-recorded.json', import.meta.url), 'utf8'));
const alternative = JSON.parse(await readFile(new URL('../test/fixtures/jev-evidence-config-recorded.json', import.meta.url), 'utf8'));
const experiment = JSON.parse(await readFile(new URL('../examples/evidence/experiment.json', import.meta.url), 'utf8'));
const documents = JSON.parse(await readFile(new URL('../examples/evidence/documents.json', import.meta.url), 'utf8'));

test('Choice, Noul and Score edits apply explicitly, export/import/reset offline, and reach the protected API only on execution', async ({ page }) => {
  const errors: string[] = [], requests: any[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (r.url().endsWith('/api/assess')) requests.push(r.postDataJSON()); });
  await page.goto('/');
  const editor = page.locator('.question-editor').first(); await editor.locator(':scope > summary').click();
  await editor.getByLabel('Question version', { exact: true }).fill('browser-questions-1');
  for (const [field, label, value] of [
    ['intended_use_case', 'intended_use_case / hr_recruitment', 'Screens job applicants for a recruiter.'],
    ['supported_use_case', 'Instructions for supported_use_case', 'Does the description document one of the listed intended uses?'],
    ['description_completeness', 'description_completeness / level 0', 'Only a product name; no identifiable task is documented.'],
  ]) {
    await editor.locator('summary').filter({ hasText: `${field} ·` }).click();
    await editor.getByLabel(label, { exact: true }).fill(value);
  }
  await editor.getByRole('button', { name: 'Apply question configuration' }).click();
  await expect(editor).toContainText('active browser-questions-1'); expect(requests).toHaveLength(0);
  const downloaded = page.waitForEvent('download'); await editor.getByRole('button', { name: 'Export question JSON' }).click();
  const path = (await (await downloaded).path())!; const config = JSON.parse(await readFile(path, 'utf8'));
  expect(config.questions.description_completeness.criteria[0]).toContain('Only a product name');
  await editor.getByRole('button', { name: 'Reset questions' }).click(); await expect(editor).toContainText('active governance-1');
  await editor.getByLabel('Import question JSON').setInputFiles(path);
  await expect(editor).toContainText('imported as a draft'); await expect(editor).toContainText('active governance-1');
  await editor.getByRole('button', { name: 'Apply question configuration' }).click();
  await page.getByLabel('Synthetic example').selectOption('hr-recruitment-reviewed');
  const response = page.waitForResponse((r) => r.url().endsWith('/api/assess'));
  await page.getByRole('button', { name: 'Analyze with Jev' }).click();
  expect((await response).status()).toBe(503); // Real protected API, intentionally missing key; no model call.
  expect(requests).toHaveLength(1); expect(requests[0].questionConfiguration).toEqual(config);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/question-editor-mobile.png', fullPage: true }); expect(errors).toEqual([]);
});

test('real saved assessments and alternative evidence runs import, restore and export without inference or review replacement', async ({ page }) => {
  let calls = 0; const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', async (route) => { calls++; await route.abort(); });
  await page.goto('/'); await page.getByRole('button', { name: 'History', exact: true }).click();
  const record = { id: 'imported-real-assessment', assessment: governance, timestamp: governance.startedAt,
    description: governance.request.state.ai_system_description, feedback: { rating: 'not_rated', comment: '' } };
  await page.getByLabel('Import history JSON').setInputFiles({ name: 'history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schemaVersion: 2, assessments: [record] })) });
  await expect(page.getByRole('table', { name: undefined })).toContainText('jev-1.14.0');
  await page.getByLabel('Import history JSON').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('status')).toContainText('Expected schemaVersion 2');
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  const result = alternative; // Complete real UI recording; no envelope normalization.
  const run = { id: 'imported-real-alternative', result, humanReviewAtRequest: null };
  const packet = { schemaVersion: 1, experiment, documents, datasetVersion: 'synthetic-oversight-1', runs: [run], humanReviewsAtExport: [] };
  await page.getByLabel('Import evidence experiment JSON').setInputFiles({ name: 'evidence.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet)) });
  await page.getByLabel('Question configuration filter', { exact: true }).selectOption({ index: 1 });
  await expect(page.getByRole('region', { name: 'Selected Jev result' })).toContainText(alternative.assessment.requestId);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export complete experiment' }).click();
  const exported = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(exported.runs[0].result).toEqual(alternative);
  expect(exported.classificationEvaluation.excludedUnlabeled).toBe(1);
  await page.reload(); await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await page.getByLabel('Question configuration filter', { exact: true }).selectOption({ index: 1 });
  await expect(page.getByRole('region', { name: 'Selected Jev result' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(calls).toBe(0); expect(errors).toEqual([]);
});
