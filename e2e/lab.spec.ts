import { openDisclosure } from './workflows';
﻿import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

const recording = JSON.parse(await readFile(new URL('../test/fixtures/jev-1.14.0-governance-recorded.json', import.meta.url), 'utf8'));

async function seedSavedRecords(page: Page) {
  // Two saved copies of the real recording, not invented inference results.
  await page.addInitScript((assessment) => {
    if (localStorage.getItem('jev.assessments.v1')) return;
    const records = ['recorded-a', 'recorded-b'].map((id) => ({ id,
      timestamp: assessment.startedAt, description: assessment.request.state.ai_system_description,
      assessment, feedback: { rating: 'positive', comment: 'Saved overall feedback.' },
    }));
    localStorage.setItem('jev.assessments.v1', JSON.stringify(records));
  }, recording);
}

test('Compare and History operate entirely offline on saved assessments', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/assess', async (route) => { calls++; await route.abort(); });
  await seedSavedRecords(page); await page.goto('/');
  await page.getByRole('button', { name: 'Vergleich', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Analysen vergleichen' })).toBeVisible();
  await page.getByLabel('Assessment A', { exact: true }).selectOption('recorded-a');
  await page.getByLabel('Assessment B', { exact: true }).selectOption('recorded-b');
  await expect(page.locator('.comparison-descriptions .comparison-description')).toHaveCount(2);
  await expect(page.locator('.comparison-field').first()).toContainText('Unverändert');
  await expect(page.locator('.comparison-field').first().getByRole('row', { name: /^Personalauswahl / })).toContainText('Unverändert');
  await page.screenshot({ path: 'test-results/compare-desktop.png', fullPage: true });
  await page.getByLabel('Assessment B', { exact: true }).selectOption('recorded-a');
  await expect(page.getByText('Zwei gespeicherte Analysen wählen.')).toBeVisible();
  await page.getByRole('button', { name: 'Verlauf', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('jev-1.14.0');
  await page.getByRole('button', { name: 'Open assessment recorded-b', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Jev assessment' })).toBeVisible();
  expect(calls).toBe(0);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Verlauf', exact: true }).click();
  await page.getByRole('button', { name: 'Verlauf leeren' }).click();
  expect(await page.evaluate(() => localStorage.getItem('jev.assessments.v1'))).toBeNull();
});

test('manual field reviews edit, persist, clear, export and drive explicit evaluation denominators', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/assess', async (route) => { calls++; await route.abort(); });
  await seedSavedRecords(page); await page.goto('/');
  await page.getByRole('button', { name: 'Auswertung', exact: true }).click(); await openDisclosure(page, '.evaluation-metrics');
  const statistics = page.getByRole('table', { name: 'Evaluation statistics' });
  await expect(statistics.getByRole('row').filter({ hasText: 'Choice-Übereinstimmung' })).toContainText('Nicht verfügbar');
  await expect(statistics.getByRole('row', { name: /^Bewertete Analysen / })).toContainText('0 / 2');
  await page.getByRole('button', { name: 'Open assessment recorded-a', exact: true }).click();
  const choice = page.getByRole('region', { name: 'Einsatzzweck', exact: true });
  await choice.locator('.field-review > summary').click();
  await choice.getByLabel('intended_use_case review judgment').selectOption('correct');
  await choice.getByLabel('intended_use_case expected category').selectOption('hr_recruitment');
  await choice.getByLabel('intended_use_case reviewer comment').fill('Human review of recorded case.');
  await choice.getByRole('button', { name: 'Bewertung speichern' }).click();
  const score = page.getByRole('region', { name: 'Vollständigkeit', exact: true });
  await score.locator('.field-review > summary').click();
  await score.getByLabel('description_completeness review judgment').selectOption('correct');
  await score.getByLabel('description_completeness expected level').selectOption('3');
  await score.getByRole('button', { name: 'Bewertung speichern' }).click();
  const noul = page.getByRole('region', { name: 'Kategorieabdeckung', exact: true });
  await noul.locator('.field-review > summary').click();
  await noul.getByLabel('supported_use_case review judgment').selectOption('uncertain');
  await noul.getByLabel('supported_use_case qualitative review').selectOption('unresolved');
  await noul.getByRole('button', { name: 'Bewertung speichern' }).click();
  await page.getByRole('button', { name: 'Auswertung', exact: true }).click(); await openDisclosure(page, '.evaluation-metrics');
  await expect(statistics.getByRole('row').filter({ hasText: 'Choice-Übereinstimmung' })).toContainText('1 / 1 (100.0%)');
  await expect(statistics.getByRole('row').filter({ hasText: 'Mittlerer absoluter Score-Fehler' })).toContainText(String(Math.abs(2.99 - 3)));
  await expect(statistics.getByRole('row', { name: /^Bewertete Analysen / })).toContainText('1 / 2');
  await page.screenshot({ path: 'test-results/evaluation-desktop.png', fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Analysen und Bewertungen exportieren', exact: true }).click();
  const file = await downloadPromise;
  const exported = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(exported.assessments[0].assessment).toEqual(recording);
  expect(exported.assessments[0].fieldReviews.supported_use_case).toEqual({ judgment: 'uncertain', comment: '', noulJudgment: 'unresolved' });
  expect(exported.assessments[0].fieldReviews.description_completeness.expectedScore).toBe(3);
  await page.getByRole('button', { name: 'Open assessment recorded-a', exact: true }).click();
  await choice.locator('.field-review > summary').click();
  await choice.getByLabel('intended_use_case review judgment').selectOption('incorrect');
  await choice.getByLabel('intended_use_case expected category').selectOption('finance_operations');
  await choice.getByRole('button', { name: 'Bewertung speichern' }).click();
  await noul.locator('.field-review > summary').click();
  await noul.getByRole('button', { name: 'Bewertung löschen' }).click();
  await expect(noul.locator('.field-review > summary')).toContainText('nicht bewertet');
  await page.reload(); await page.getByRole('button', { name: 'Auswertung', exact: true }).click(); await openDisclosure(page, '.evaluation-metrics');
  await expect(statistics.getByRole('row').filter({ hasText: 'Choice-Übereinstimmung' })).toContainText('0 / 1 (0.0%)');
  await expect(page.getByRole('table', { name: 'Field review counts' }).getByRole('row').filter({ hasText: 'Kategorieabdeckung' })).toContainText('0');
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/evaluation-desktop-compact.png', fullPage: true });
  expect(calls).toBe(0);
});

test('server-disabled inference preserves saved reviews and all offline views', async ({ page, request }) => {
  await seedSavedRecords(page); await page.goto('http://127.0.0.1:3198');
  await expect(page.getByRole('button', { name: 'Mit Jev analysieren' })).toBeDisabled();
  await expect(page.getByText('Jev-Aufrufe deaktiviert.', { exact: false })).toBeVisible();
  for (const [name, region] of [['Vergleich', 'Analysen vergleichen'], ['Auswertung', 'Auswertung'], ['Belege', 'Belegsuche'], ['Verlauf', 'Gespeicherte Analysen']]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('region', { name: region, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Open assessment recorded-a', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Jev assessment' })).toBeVisible();
  const response = await request.post('http://127.0.0.1:3198/api/assess', { data: { description: 'Explicit offline disabled test.', live: true } });
  expect(response.status()).toBe(503); expect(await response.text()).toContain('disabled');
});
