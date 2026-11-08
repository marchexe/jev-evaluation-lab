import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { translationFor } from '../components/translations';
import cases from '../examples/governance/cases.json' with { type: 'json' };

// Replay a real recording, never a classifier prediction fabricated for a test.
const recording = JSON.parse(await readFile(new URL('../test/fixtures/jev-1.14.0-governance-recorded.json', import.meta.url), 'utf8'));

test('initial page, all 15 examples and desktop-compact layout do not start inference', async ({ page }) => {
  let calls = 0;
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.route('**/api/assess', async (route) => { calls++; await route.abort(); });
  await page.goto('/');
  await expect(page).toHaveTitle('Jev Evaluation Lab');
  await expect(page.getByRole('link', { name: 'Jev Evaluation Lab', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Analyse', exact: true })).toBeVisible();
  const desktopInput = await page.getByLabel('Systembeschreibung').boundingBox();
  expect(desktopInput!.y).toBeLessThan(450);
  await expect(page.getByRole('region', { name: 'Assessment overview' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mit Jev analysieren' })).toBeDisabled();
  for (const entry of cases) {
    await page.getByLabel('Beispiel').selectOption(entry.id);
    await expect(page.getByLabel('Systembeschreibung')).toHaveValue(translationFor(entry.description)!);
  }
  await page.getByLabel('Systembeschreibung').press('Enter');
  expect(calls).toBe(0);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('button', { name: 'Mit Jev analysieren' })).toBeVisible();
  const compactInput = await page.getByLabel('Systembeschreibung').boundingBox();
  expect(compactInput!.y).toBeLessThan(550);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/desktop-compact.png', fullPage: true });
  expect(browserErrors).toEqual([]);
});

test('one explicit action renders the recorded result, preserves exports, and restores feedback', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/assess', async (route) => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({ description: cases[0].description, live: true });
    await route.fulfill({ json: recording });
  });
  await page.goto('/');
  await page.getByLabel('Beispiel').selectOption(cases[0].id);
  await page.getByRole('button', { name: 'Mit Jev analysieren' }).click();
  const card = page.getByRole('article', { name: 'Jev assessment' });
  await expect(card).toBeVisible();
  await expect(card.getByText('2.99', { exact: true })).toBeVisible();
  await expect(card.getByText('0.01', { exact: true })).toBeVisible();
  await card.locator('summary').first().click();
  await expect(card.getByRole('rowheader', { name: 'Kreditbewertung', exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Ergebnis exportieren (JSON)' }).click();
  const file = await downloadPromise;
  expect(file.suggestedFilename()).toMatch(/^jev-assessment-.*\.json$/);
  expect(JSON.parse(await readFile((await file.path())!, 'utf8'))).toEqual(recording);
  await card.locator('.feedback-section > summary').click();
  await card.getByLabel('Richtig', { exact: true }).check();
  await card.getByLabel('Kommentar').fill('Manual review of recorded response.');
  const historyDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Verlauf', exact: true }).click();
  await page.getByRole('button', { name: 'Verlauf exportieren' }).click();
  const historyFile = await historyDownload;
  expect(historyFile.suggestedFilename()).toBe('jev-history.json');
  const exported = JSON.parse(await readFile((await historyFile.path())!, 'utf8'));
  expect(exported.assessments[0].assessment).toEqual(recording);
  expect(exported.assessments[0].feedback).toEqual({ rating: 'positive', comment: 'Manual review of recorded response.' });
  expect(exported.assessments[0].id).toBeTruthy();
  await page.evaluate(() => { document.querySelector('.thread-viewport')?.scrollTo(0, 0); });
  await page.screenshot({ path: 'test-results/assessment.png', fullPage: true });
  await page.reload();
  const history = page.getByRole('navigation', { name: 'Assessment history' });
  await history.getByRole('button').first().click();
  await page.locator('.feedback-section > summary').click();
  await expect(page.getByLabel('Richtig', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Kommentar')).toHaveValue('Manual review of recorded response.');
  expect(calls).toBe(1);
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/assessment-desktop-compact.png', fullPage: true });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Verlauf', exact: true }).click();
  await page.getByRole('button', { name: 'Verlauf leeren' }).click();
  await expect(history.getByRole('button')).toHaveCount(0);
});

test('loading prevents duplicate requests, cancellation does not retry, and errors stay errors', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/assess', async (route) => {
    calls++;
    if (calls === 1) {
      // Keep the browser request pending until the explicit Cancel action aborts it.
      await new Promise<void>((resolve) => route.request().response().then(() => resolve(), () => resolve()));
    } else await route.fulfill({ status: 503, json: { error: 'Offline test: server key is missing.' } });
  });
  await page.goto('/');
  await page.getByLabel('Beispiel').selectOption(cases[0].id);
  await page.getByRole('button', { name: 'Mit Jev analysieren' }).click();
  await expect(page.getByRole('button', { name: 'Abbrechen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Neue Analyse' })).toBeDisabled();
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(page.getByText('Abgebrochen. Kosten können bereits entstanden sein.', { exact: true })).toBeVisible();
  expect(calls).toBe(1);
  await page.getByLabel('Systembeschreibung').fill('Another synthetic description.');
  await page.getByRole('button', { name: 'Mit Jev analysieren' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Offline test: server key is missing.' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Jev assessment' })).toHaveCount(0);
  expect(calls).toBe(2);
});

test('production API rejects invalid requests without a Jev call', async ({ request }) => {
  const invalid = await request.post('/api/assess', { data: { description: 'Example' } });
  expect(invalid.status()).toBe(400);
  const notConfigured = await request.post('/api/assess', { data: { description: 'Example', live: true } });
  expect(notConfigured.status()).toBe(503);
  const externalOrigin = await request.post('/api/assess', {
    headers: { Origin: 'https://evil.example', 'X-Forwarded-Host': 'evil.example' },
    data: { description: 'Offline rejected-origin regression.', live: true },
  });
  expect(externalOrigin.status()).toBe(403);
});

for (const hostname of ['127.0.0.1', 'localhost']) {
  test(`real Analyze action from ${hostname} passes CSRF validation without inference`, async ({ page }) => {
    // No route interception: exercise the real Next.js route with a missing server key.
    await page.goto(`http://${hostname}:3197`);
    await page.getByLabel('Systembeschreibung').fill('Offline same-origin browser regression.');
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/assess'));
    await page.getByRole('button', { name: 'Mit Jev analysieren' }).click();
    const response = await responsePromise;
    expect((await response.request().allHeaders()).origin).toBe(`http://${hostname}:3197`);
    expect(response.status()).toBe(503);
    await expect(page.getByRole('alert').filter({ hasText: 'Set TYPESAFE_API_KEY on the server' })).toBeVisible();
    await expect(page.getByText('Cross-origin assessment requests are not allowed.')).toHaveCount(0);
  });
}
