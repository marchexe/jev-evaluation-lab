import { openJev, evaluateEvidence , openReview } from './workflows';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const recording = JSON.parse(await readFile(new URL('../test/fixtures/jev-evidence-approval-recorded.json', import.meta.url), 'utf8'));
test('one explicit evidence action replays a real recording; reviews drive evaluation without new inference', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/evidence', async (route) => {
    calls++; expect(route.request().postDataJSON()).toEqual({ passageId: recording.passage.id, controlId: recording.controlId, live: true });
    await route.fulfill({ json: recording });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Belege', exact: true }).click(); await openJev(page); await openJev(page);
  expect(calls).toBe(0);
  await page.getByRole('button', { name: 'Mit Jev bewerten' }).click();
  const result = page.getByRole('region', { name: 'Selected Jev result' });
  await expect(result).toContainText(recording.assessment.response.model);
  await expect(result).toContainText(recording.assessment.requestId);
  const policy = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Richtlinie des Dispatch-Assistenten', exact: true }) });
  await openReview(policy);
  await policy.getByLabel('Belegaussage').selectOption(recording.assessment.response.answers.evidence_judgment.choice);
  await policy.getByRole('button', { name: 'Bewertung speichern' }).click();
  const panel = page.getByRole('region', { name: 'Jev-Belegbewertung', exact: true });
  await expect(panel).toContainText('Übereinstimmung: 1 / 1');
  await page.locator('.lab-panel').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: 'test-results/evidence-judgment-desktop.png', fullPage: true });
  await policy.getByLabel('Belegaussage').selectOption('uncertain');
  await policy.getByRole('button', { name: 'Bewertung speichern' }).click();
  await expect(panel).toContainText('unsicher ausgeschlossen: 1');
  const download = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Experiment exportieren' }).click();
  const data = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(data.runs[0].result).toEqual(recording);
  expect(data.humanReviewsAtExport[0].judgment).toBe('uncertain');
  expect(data.classificationEvaluation.n).toBe(0);
  await page.reload(); await evaluateEvidence(page);
  await expect(page.getByRole('table', { name: 'Evidence confusion matrix' })).toBeVisible();
  await expect(panel).toContainText('unsicher ausgeschlossen: 1');
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/evidence-judgment-desktop-compact.png', fullPage: true });
  expect(calls).toBe(1);
});

test('evidence cancellation prevents duplicate calls and errors never become predictions', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/evidence', async (route) => {
    calls++;
    if (calls === 1) {
      await new Promise<void>((resolve) => route.request().response().then(() => resolve(), () => resolve()));
    } else await route.fulfill({ status: 503, json: { error: 'Offline evidence test: server key is missing.' } });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Belege', exact: true }).click(); await openJev(page);
  const judge = page.getByRole('button', { name: 'Mit Jev bewerten' });
  await judge.click();
  await expect(judge).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Analyse', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Auswertung', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Abgebrochen. Kosten können bereits entstanden sein.' })).toBeVisible();
  expect(calls).toBe(1);
  await judge.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Offline evidence test: server key is missing.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Selected Jev result' })).toHaveCount(0);
  expect(calls).toBe(2);
});

test('disabled inference and external requests cannot reach Jev evidence judgment', async ({ page, request }) => {
  await page.goto('http://127.0.0.1:3198'); await page.getByRole('button', { name: 'Belege', exact: true }).click(); await openJev(page);
  await expect(page.getByRole('button', { name: 'Mit Jev bewerten' })).toBeDisabled();
  expect((await request.post('http://127.0.0.1:3198/api/evidence', { data: { caseId: 'approval-gate', live: true } })).status()).toBe(503);
  expect((await request.post('http://127.0.0.1:3198/api/evidence', { headers: { origin: 'https://evil.example' }, data: { caseId: 'approval-gate', live: true } })).status()).toBe(403);
});
