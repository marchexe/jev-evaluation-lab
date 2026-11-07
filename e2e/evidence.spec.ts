import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import manifest from '../examples/evidence/experiment.json' with { type: 'json' };
import documents from '../examples/evidence/documents.json' with { type: 'json' };

test('evidence retrieval, human review, export and Evaluate work offline with inference disabled', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/assess', async (route) => { calls++; await route.abort(); });
  await page.goto('http://127.0.0.1:3198');
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Governance Evidence Explorer' })).toBeVisible();
  const policy = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Dispatch assistant policy', exact: true }) });
  const runbook = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Dispatch assistant runbook', exact: true }) });
  await expect(policy).toContainText('must approve every recommendation');
  await expect(runbook).toContainText('without human approval');
  await page.screenshot({ path: 'test-results/evidence-desktop.png', fullPage: true });
  await policy.getByText('Review passage: not reviewed', { exact: true }).click();
  await policy.getByLabel('Evidence judgment').selectOption('supported');
  await policy.getByLabel('Retrieval relevance').selectOption('relevant');
  await policy.getByLabel('Reviewer comment').fill('Approval gate documented.');
  await policy.getByRole('button', { name: 'Save evidence review' }).click();
  await expect(policy).toContainText('Review passage: supported');
  await page.getByLabel('Documented system').selectOption('ledger');
  await expect(page.getByText('No candidate passages.', { exact: false })).toBeVisible();
  await page.getByLabel('Inspect all source passages', { exact: false }).check();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('button', { name: 'Evaluate', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Evidence evaluation' })).toContainText('Retrieved 1 / 1');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export evidence + reviews' }).click();
  const data = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(data.reviews[0].passage.text).toContain('must approve every recommendation');
  expect(data.reviews[0].passage.documentId).toBe('dispatch-policy');
  await page.reload(); await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await policy.getByText('Review passage: supported', { exact: true }).click();
  await policy.getByLabel('Evidence judgment').selectOption('uncertain');
  await policy.getByRole('button', { name: 'Save evidence review' }).click();
  await expect(policy).toContainText('Review passage: uncertain');
  await policy.getByRole('button', { name: 'Clear evidence review' }).click();
  await expect(policy).toContainText('Review passage: not reviewed');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/evidence-mobile.png', fullPage: true });
  expect(calls).toBe(0);
});

test('invalid evidence storage is preserved and can be exported without overwriting it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jev.evidence-reviews.v1', '{broken'));
  await page.goto('http://127.0.0.1:3198');
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Governance Evidence Explorer' }).getByRole('alert')).toContainText('could not be loaded');
  await expect(page.getByRole('button', { name: 'Export evidence + reviews' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export complete experiment' })).toBeDisabled();
  await expect(page.getByRole('table', { name: 'Evidence confusion matrix' })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Human reviews are unavailable.' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export stored evidence data' }).click();
  expect(await readFile((await (await download).path())!, 'utf8')).toBe('{broken');
  expect(await page.evaluate(() => localStorage.getItem('jev.evidence-reviews.v1'))).toBe('{broken');
});

test('all six human references can be recorded and exported before any model predictions exist', async ({ page }) => {
  let calls = 0;
  await page.route(/\/api\/(?:assess|evidence)$/, async (route) => { calls++; await route.abort(); });
  await page.goto('http://127.0.0.1:3198');
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await page.getByLabel('Inspect all source passages', { exact: false }).check();
  const labels = ['supported', 'contradicted', 'ambiguous', 'insufficient_evidence', 'insufficient_evidence', 'ambiguous'];
  for (const [index, entry] of manifest.cases.entries()) {
    const document = documents.find((value) => value.id === entry.documentId)!;
    await page.getByLabel('Documented system').selectOption(document.systemId);
    const passage = page.getByRole('article', { name: `${document.title} / ${entry.section}`, exact: true });
    await passage.getByText('Review passage: not reviewed', { exact: true }).click();
    await passage.getByLabel('Evidence judgment').selectOption(labels[index]);
    await passage.getByLabel('Retrieval relevance').selectOption([3, 4].includes(index) ? 'not_relevant' : 'relevant');
    await passage.getByLabel('Reviewer comment').fill('Pre-inference reviewer annotation example.');
    await passage.getByRole('button', { name: 'Save evidence review' }).click();
  }
  const panel = page.getByRole('region', { name: 'Jev evidence judgments', exact: true });
  await expect(panel).toContainText('6 cases; 0 saved runs');
  await expect(page.getByRole('region', { name: 'Governance Evidence Explorer' })).toContainText('Retrieved 3 / 4 manually marked relevant passages; missed 1');
  await page.reload(); await page.getByRole('button', { name: 'Evaluate', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export complete experiment' }).click();
  const exported = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(exported.humanReviewsAtExport).toHaveLength(6);
  for (const [index, entry] of manifest.cases.entries()) {
    const review = exported.humanReviewsAtExport.find((value: { passage: { documentId: string; section: string } }) => value.passage.documentId === entry.documentId && value.passage.section === entry.section);
    expect(review.judgment).toBe(labels[index]); expect(review.controlId).toBe(entry.controlId);
    expect(review.passage.revision).toBe(entry.revision);
    expect(documents.find((document) => document.id === entry.documentId)!.content.slice(review.passage.start, review.passage.end)).toBe(review.passage.text);
  }
  expect(exported.runs).toEqual([]);
  expect(exported.classificationEvaluation.n).toBe(0);
  expect(exported.classificationEvaluation.missingPredictions).toBe(6);
  expect(calls).toBe(0);
});
