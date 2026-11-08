import { type Page, type Locator } from '@playwright/test';

export async function openReview(scope: Locator) {
  const details = scope.locator('.field-review');
  if (!await details.evaluate(element => (element as HTMLDetailsElement).open)) await details.locator(':scope > summary').click();
}

export async function openDisclosure(page: Page, selector: string) {
  const details = page.locator(selector);
  if (selector !== '.evidence-tools' && await details.evaluate(element => !!element.closest('.evidence-tools'))) {
    const parent=page.locator('.evidence-tools');
    if (!await parent.evaluate(element => (element as HTMLDetailsElement).open)) await parent.locator(':scope > summary').click();
  }
  if (!await details.evaluate((element) => (element as HTMLDetailsElement).open)) await details.locator(':scope > summary').click();
}

export async function explore(page: Page) {
  await page.getByRole('button', { name: 'Belege', exact: false }).click();
}

export async function inspectPassage(page: Page, id: string, browse = false) {
  await openDisclosure(page, '.source-browser-details');
  if (browse) await page.getByLabel('Alle Quellabschnitte anzeigen', { exact: false }).check();
  await page.getByLabel('Quellabschnitt', { exact: true }).selectOption(id);
  return page.locator('#passage-inspector').getByRole('article');
}

export async function openJev(page: Page) {
  await openDisclosure(page, '.machine-review');
}

export async function evaluateEvidence(page: Page) {
  await page.getByRole('button', { name: 'Auswertung', exact: false }).click();
  await page.getByRole('button', { name: 'Belegexperimente', exact: true }).click();
}

export async function compareSources(page: Page) {
  await openDisclosure(page, '.search-comparison-details');
  const filter=page.getByLabel(/^(Nur Unterschiede|Differences only)$/);
  await filter.uncheck();
  return page.locator('.comparison-source-table');
}

export async function inspectCompared(page: Page, id: string) {
  const table=await compareSources(page);
  const row=table.locator('tr[data-passage-id="'+id+'"]');
  const button=row.getByRole('button');
  if(await button.getAttribute('aria-expanded') !== 'true') await button.click();
  await page.locator('.comparison-inline-source').getByRole('button',{name:/^(Diesen Abschnitt bewerten|Review this passage)$/}).click();
  return page.locator('#passage-inspector').getByRole('article');
}
