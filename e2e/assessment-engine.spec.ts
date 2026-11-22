import {test,expect} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';

test('the same guided UI renders a second use case, exports pinned definitions and restores separate drafts',async({page})=>{
 let inference=0;page.on('request',r=>{if(r.url().includes('/api/regulatory-evidence'))inference++;});
 await page.goto('/');await page.getByRole('button',{name:'Prüfungen',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Claude Code im Unternehmen'})).toBeVisible();
 await page.getByRole('combobox',{name:'Anwendungsfall',exact:true}).selectOption('internal-assistant');
 await expect(page.getByRole('heading',{name:'Internen KI-Assistenten einführen'})).toBeVisible();
 await expect(page.getByLabel('Vertrags-/Zugangsvariante')).toHaveCount(0);
 await expect(page.getByLabel('Musterfall')).toHaveValue('internal-assistant-pilot');
 await page.getByRole('button',{name:'3 · Bericht',exact:true}).click();
 const table=page.getByRole('table',{name:'Prüfergebnisse'});
 await expect(table.locator('tbody tr')).toHaveCount(4);
 for(const outcome of ['satisfied','gap','unknown','not_applicable'])await expect(table.locator(`[data-outcome="${outcome}"]`)).toHaveCount(1);
 await expect(page.locator('.regulatory-workspace')).toContainText('Historische Quellen müssen auf die aktuelle Rechtslage geprüft werden.');
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'Bericht als JSON',exact:true}).click();
 const download=await event;expect(download.suggestedFilename()).toBe('internal-assistant-report.json');
 const report=JSON.parse(await readFile(await download.path(),'utf8'));
 expect(report.useCaseId).toBe('internal-assistant');expect(report.definitions.catalog.version).toBe('2');expect(report.engineVersion).toBe('documentary-engine-1');expect(report.draft.runs).toEqual([]);
 await mkdir('results/assessment-refactor',{recursive:true});await page.screenshot({path:'results/assessment-refactor/internal-report.png',fullPage:true});
 await page.getByRole('button',{name:'2 · Belege prüfen',exact:true}).click();
 await page.getByRole('button',{name:'Zweck und Rechtsgrundlage',exact:true}).click();
 await page.locator('.regulatory-human > summary').click();await page.getByLabel('Aussage des Belegs').selectOption('insufficient_evidence');await page.getByLabel('Kommentar',{exact:true}).fill('Synthetischer Prüfvermerk');await page.getByRole('button',{name:'Bewertung speichern',exact:true}).click();
 await expect(page.locator('.regulatory-workspace').getByRole('alert')).toBeVisible();
 await page.getByRole('combobox',{name:'Anwendungsfall',exact:true}).selectOption('claude-code');
 await expect(page.locator('.regulatory-columns tbody tr')).toHaveCount(7);
 await expect(page.locator('.regulatory-human > summary')).not.toContainText('Unzureichend');
 await page.getByRole('combobox',{name:'Anwendungsfall',exact:true}).selectOption('internal-assistant');
 await expect(page.locator('.regulatory-human > summary')).toContainText('Unzureichend');
 await page.reload();await page.getByRole('button',{name:'Prüfungen',exact:true}).click();await expect(page.getByRole('combobox',{name:'Anwendungsfall',exact:true})).toHaveValue('internal-assistant');
 expect(inference).toBe(0);
});

test('pre-refactor report imports into the shared workflow and unavailable requirements fail before inference',async({page,request})=>{
 await page.goto('/');await page.getByRole('button',{name:'Prüfungen',exact:true}).click();await page.getByRole('button',{name:'3 · Bericht',exact:true}).click();
 await page.getByLabel('Bericht importieren').setInputFiles('test/fixtures/regulatory-report-v1.json');
 await expect(page.getByRole('status')).toHaveText('Bericht importiert.');await expect(page.getByLabel('Musterfall')).toHaveValue('claude-documented');
 await expect(page.locator('[data-outcome="satisfied"]')).toHaveCount(6);
 await page.screenshot({path:'results/assessment-refactor/claude-migrated.png',fullPage:true});
 const response=await request.post('/api/regulatory-evidence',{headers:{origin:'http://127.0.0.1:3197'},data:{scenarioId:'internal-assistant-pilot',checkId:'processor-contract',evidenceId:'invented',live:true}});
 expect(response.status()).toBe(400);
});
