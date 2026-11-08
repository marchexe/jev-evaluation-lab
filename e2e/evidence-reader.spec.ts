import { test, expect } from '@playwright/test';

for(const language of ['de','en'] as const) test('evidence reader keeps sources, quotation and retrieval reason visible in '+language, async({page})=>{
  let calls=0;const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{calls++;await route.abort();});
  await page.emulateMedia({colorScheme:language==='en'?'dark':'light'});
  await page.goto('http://127.0.0.1:3198');
  if(language==='en')await page.getByLabel('Sprache wählen',{exact:true}).selectOption('en');
  await page.getByRole('button',{name:language==='en'?'Evidence':'Belege',exact:true}).click();
  const inspector=page.locator('#passage-inspector');
  await expect(page.locator('.evidence-steps')).toHaveCount(0);
  await expect(page.locator('.evidence-tools > .evidence-tool-content')).toBeHidden();
  await expect(inspector.locator('.passage-reason')).toContainText(language==='en'?'Contains search terms':'Enthält Suchbegriffe');
  await expect(inspector.getByLabel(language==='en'?'Evidence judgment':'Belegaussage')).toBeHidden();
  await expect(page.locator('.machine-review > section')).toBeHidden();
  await page.getByRole('button',{name:'Inspect source result dispatch-signoff@1:34-107',exact:true}).click();
  await expect(inspector.locator('blockquote').first()).toContainText(language==='en'?'A staff member must countersign':'muss jeden Vorschlag gegenzeichnen');
  await expect(inspector.locator('.passage-reason')).toContainText(language==='en'?'Dispatch gate register':'Dispatch-Freigaberegister');
  await expect(inspector.locator('.passage-reason')).toContainText(language==='en'?'documented relationships':'dokumentierte Verknüpfungen');
  const quote=inspector.locator('blockquote').first();
  expect(await quote.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
  await page.screenshot({path:'results/evidence-reader/reader-'+language+'-1440.png',fullPage:false});
  await page.setViewportSize({width:1280,height:900});
  await expect(quote).toBeInViewport({ratio:1});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'results/evidence-reader/reader-'+language+'-1280.png',fullPage:false});
  expect(calls).toBe(0);expect(errors).toEqual([]);
});
