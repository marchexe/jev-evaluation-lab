import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import cases from '../examples/governance/cases.json' with { type: 'json' };
import { translationFor } from '../components/translations';

const recorded = JSON.parse(await readFile(new URL('../test/fixtures/jev-1.14.0-governance-recorded.json', import.meta.url), 'utf8'));

test('globe switches the whole workspace, source language and persisted preference without inference or data changes', async ({ page }) => {
  let calls = 0; const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => { calls++; await route.abort(); });
  await page.addInitScript(assessment => {
    if (!localStorage.getItem('jev.assessments.v1')) localStorage.setItem('jev.assessments.v1', JSON.stringify([{
      id:'language-recording', assessment, timestamp:assessment.startedAt, description:assessment.request.state.ai_system_description,
      feedback:{ rating:'not_rated', comment:'' }, fieldReviews:{ intended_use_case:{ judgment:'correct', comment:'Independent review.', expectedChoice:'hr_recruitment' } },
    }]));
  }, recorded);
  await page.goto('http://127.0.0.1:3198');
  const before = await page.evaluate(() => localStorage.getItem('jev.assessments.v1'));
  await page.getByLabel('Sprache wählen', { exact:true }).selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('h1')).toHaveText('Analyze');
  await expect(page.getByLabel('System description', { exact:true })).toBeVisible();
  await expect(page.getByRole('button',{name:'Analyze with Jev',exact:true})).toBeDisabled();
  await page.screenshot({path:'results/ux-redesign/screenshots/language-english-analyze.png',fullPage:true});
  await page.getByRole('button',{name:'Evidence',exact:true}).click();
  await expect(page.getByRole('region',{name:'Retrieved sources',exact:true})).toBeVisible();
  const inspector = page.locator('#passage-inspector');
  await expect(inspector).toContainText('A human supervisor must approve every recommendation');
  await expect(inspector.getByRole('button',{name:'Show original',exact:true})).toHaveCount(0);
  await page.getByLabel('Choose language',{exact:true}).selectOption('de');
  await expect(inspector).toContainText('Eine menschliche Aufsichtsperson muss jede Empfehlung genehmigen');
  await expect(inspector.getByRole('button',{name:'Original anzeigen',exact:true})).toHaveCount(0);
  await page.getByLabel('Sprache wählen',{exact:true}).selectOption('en');
  await page.getByRole('button',{name:'Evaluate',exact:true}).click();
  await page.locator('.evaluation-metrics > summary').click();
  await expect(page.getByRole('table',{name:'Evaluation statistics'})).toContainText('1 / 1 (100.0%)');
  await expect(page.getByRole('heading',{name:'Review judgments by field'})).toBeVisible();
  await page.screenshot({path:'results/ux-redesign/screenshots/language-english-evaluate.png',fullPage:true});
  await page.getByRole('button',{name:'History',exact:true}).click();
  await expect(page.getByRole('button',{name:'Export history',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  expect(await page.evaluate(() => localStorage.getItem('jev.assessments.v1'))).toBe(before);
  expect(calls).toBe(0); expect(errors).toEqual([]);
});

test('language selection preserves edited drafts, exact request text, reviews and JSON exports', async ({page}) => {
  const requests: unknown[] = [];
  await page.route('**/api/assess',async route => { requests.push(route.request().postDataJSON()); await route.fulfill({json:recorded}); });
  await page.goto('/');
  await page.getByLabel('Beispiel',{exact:true}).selectOption(cases[0].id);
  await expect(page.getByLabel('Systembeschreibung',{exact:true})).toHaveValue(translationFor(cases[0].description)!);
  await page.getByLabel('Sprache wählen',{exact:true}).selectOption('en');
  await expect(page.getByLabel('System description',{exact:true})).toHaveValue(cases[0].description);
  await page.getByLabel('System description',{exact:true}).fill('My edited system description.');
  await page.getByLabel('Choose language',{exact:true}).selectOption('de');
  await expect(page.getByLabel('Systembeschreibung',{exact:true})).toHaveValue('My edited system description.');
  await page.getByLabel('Sprache wählen',{exact:true}).selectOption('en');
  expect(requests).toHaveLength(0);
  await page.getByRole('button',{name:'Analyze with Jev',exact:true}).click();
  const card = page.getByRole('article',{name:'Jev assessment'}); await expect(card).toBeVisible();
  expect(requests).toEqual([{description:'My edited system description.',live:true}]);
  await expect(card.getByRole('heading',{name:'Intended use case',exact:true})).toBeVisible();
  await expect(card.locator('.selected-label').first()).toHaveText('Recruitment');
  await page.screenshot({path:'results/ux-redesign/screenshots/language-english-results.png',fullPage:true});
  const download=page.waitForEvent('download'); await card.getByRole('button',{name:'Export result (JSON)',exact:true}).click();
  expect(JSON.parse(await readFile((await(await download).path())!,'utf8'))).toEqual(recorded);
  await page.getByLabel('Choose language',{exact:true}).selectOption('de');
  await expect(card.getByRole('heading',{name:'Einsatzzweck',exact:true})).toBeVisible();
  expect(requests).toHaveLength(1);
});
