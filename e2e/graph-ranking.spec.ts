import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('graph ranking is explicit, reversible and exported without inference', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/**', async route => { calls++; await route.abort(); });
  await page.goto('http://127.0.0.1:3198');
  await page.getByRole('button', { name: /^(Belege|Evidence)$/ }).click();
  const paired = await page.locator('.retrieval-comparison').count() > 0;
  if (!paired) await page.getByLabel('Search strategy').selectOption('graph');
  const graph = page.getByRole('region', { name: /^(Graphsuche – Ergebnisse|Graph Search results)$/ });
  const text = page.getByRole('region', { name: /^(Textsuche – Ergebnisse|Text Search results)$/ });
  const rows = paired ? graph.getByRole('button', { name: /^Inspect graph result/ }) : page.locator('.evidence-passage .evidence-source');
  const baseline = paired ? await text.textContent() : null;
  const queue = 'dispatch-signoff@1:34-107';
  async function expectRank(index: number) {
    if (paired) await expect(rows.nth(index)).toHaveAttribute('aria-label', `Inspect graph result ${queue}`);
    else await expect(rows.nth(index)).toHaveText(queue);
  }
  await expectRank(4);
  const settings = page.locator('.search-settings');
  if (await settings.count()) await settings.locator(':scope > summary').click();
  const ranking = page.getByLabel(/^(Graphsortierung|Graph ranking)$/);
  await expect(ranking).toHaveValue('document-diversity-1');
  await ranking.selectOption('lexical-path-1');
  await expectRank(6);
  if (paired) expect(await text.textContent()).toBe(baseline);
  await ranking.selectOption('document-diversity-1');
  await expectRank(4);
  const depth = page.getByLabel(/Suchtiefe|Traversal depth/);
  await depth.selectOption('4');
  if (paired) await expect(graph.getByRole('button', { name: `Inspect graph result ${queue}`, exact: true })).toHaveCount(0);
  else await expect(rows.filter({ hasText: queue })).toHaveCount(0);
  await depth.selectOption('5');
  if (paired) await graph.getByRole('button', { name: `Inspect graph result ${queue}`, exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /^(Belege und Bewertungen exportieren|Export evidence (and|\+) reviews)$/ }).click();
  const exported = JSON.parse(await readFile((await (await downloaded).path())!, 'utf8'));
  expect(exported.search.result.query.ranking).toBe('document-diversity-1');
  expect(exported.search.result.ranking.changes.find((row: { passageId: string }) => row.passageId === queue)).toEqual({ passageId: queue, previousRank: 7, rank: 5 });
  expect(exported.search.result.hits[4].path.steps).toHaveLength(5);
  await page.screenshot({ path: 'results/graph-refinement/ranking.png', fullPage: true });
  expect(calls).toBe(0);
});
