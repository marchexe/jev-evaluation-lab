import { test, expect } from '@playwright/test';

test('guided Claude Code assessment runs offline, preserves exact citations and exports a reproducible report',async({page})=>{
 let calls=0;page.on('request',r=>{if(r.url().includes('/api/regulatory-evidence'))calls++;});
 await page.goto('/');await page.getByRole('button',{name:'Prüfungen',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Claude Code im Unternehmen'})).toBeVisible();
 await page.getByRole('button',{name:'Prüfung öffnen',exact:true}).click();
 await page.getByRole('button',{name:'Auftragsverarbeitung',exact:true}).click();
 await expect(page.locator('[data-outcome="gap"]').first()).toBeVisible();
 const citation=page.locator('.regulatory-citation').filter({hasText:'Art. 28 Abs. 3'});await citation.locator('summary').click();
 await expect(citation.getByRole('blockquote')).toContainText('Die Verarbeitung durch einen Auftragsverarbeiter');
 await expect(citation).toContainText('EU_DSGVO.pdf');await expect(citation).toContainText('49');
 const screenshots=await import('node:fs/promises');await screenshots.mkdir('results/regulatory-demo',{recursive:true});await page.screenshot({path:'results/regulatory-demo/evidence.png',fullPage:true});
 await page.getByRole('button',{name:'3 · Bericht',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Bericht als JSON',exact:true}).click();
 const fs=await import('node:fs/promises');const downloaded=await download;const data=JSON.parse(await fs.readFile(await downloaded.path(),'utf8'));
 expect(data.kind).toBe('claude-code-assessment');expect(data.findings.find((f:any)=>f.checkId==='processor-contract').outcome).toBe('gap');expect(data.draft.runs).toEqual([]);
 expect(data.corpus.citations.find((c:any)=>c.id==='gdpr-28-3').pdfPage).toBe(49);
 await page.screenshot({path:'results/regulatory-demo/report.png',fullPage:true});
 await page.reload();await page.getByRole('button',{name:'Prüfungen',exact:true}).click();await expect(page.getByLabel('Musterfall')).toHaveValue('claude-pilot');expect(calls).toBe(0);
});

test('examples distinguish documented, not applicable and conflicting facts; human reviews exist before Jev',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Prüfungen',exact:true}).click();await page.getByLabel('Musterfall').selectOption('claude-documented');
 await page.getByRole('button',{name:'3 · Bericht',exact:true}).click();await expect(page.locator('[data-outcome="satisfied"]')).toHaveCount(6);await expect(page.locator('[data-outcome="not_applicable"]')).toHaveCount(1);
 await page.getByRole('button',{name:'2 · Belege prüfen',exact:true}).click();await page.getByRole('button',{name:'Auftragsverarbeitung',exact:true}).click();
 await page.locator('.regulatory-human > summary').click();await page.getByLabel('Aussage des Belegs').selectOption('contradicted');await page.getByRole('button',{name:'Bewertung speichern',exact:true}).click();
 await expect(page.locator('.regulatory-workspace').getByRole('alert')).toContainText('Widersprüchliche Angaben');
 await page.getByLabel('Musterfall').selectOption('claude-conflict');await page.getByRole('button',{name:'3 · Bericht',exact:true}).click();await expect(page.locator('[data-outcome="unknown"]')).toHaveCount(7);
 await page.getByLabel('Musterfall').selectOption('claude-documented');await page.getByRole('button',{name:'2 · Belege prüfen',exact:true}).click();await expect(page.locator('.regulatory-human > summary')).toContainText('Widerspricht');
});

test('English assessment uses the same stored facts; forged reports and external API requests are rejected',async({page,request})=>{
 await page.goto('/');await page.getByLabel('Sprache wählen').selectOption('en');await page.getByRole('button',{name:'Assessments',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Claude Code adoption'})).toBeVisible();await page.getByRole('button',{name:'3 · Report',exact:true}).click();
 await page.getByLabel('Import report').setInputFiles({name:'forged.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({kind:'claude-code-assessment',findings:[{outcome:'satisfied'}]}))});await expect(page.getByRole('status')).toContainText('Import rejected');
 const response=await request.post('/api/regulatory-evidence',{headers:{origin:'https://evil.example'},data:{live:true}});expect(response.status()).toBe(403);
 expect((await request.post('/api/regulatory-evidence',{data:{checkId:'invented',live:true}})).status()).toBe(400);
});

test('server-disabled live inference leaves the complete regulatory workflow usable',async({page})=>{
 await page.goto('http://127.0.0.1:3198');await page.getByRole('button',{name:'Prüfungen',exact:true}).click();await page.getByRole('button',{name:'2 · Belege prüfen',exact:true}).click();
 await page.getByText('Jev-Belegprüfung',{exact:true}).click();await expect(page.getByRole('button',{name:'Beleg mit Jev prüfen',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'3 · Bericht',exact:true}).click();await expect(page.getByRole('table',{name:'Prüfergebnisse'})).toBeVisible();
});
