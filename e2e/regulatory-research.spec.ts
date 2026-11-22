import {test,expect} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';

test('synthetic requirement discovery, independent human review and frozen snapshots work offline without changing Claude outcomes',async({page})=>{
 const corpus=JSON.parse(await readFile('examples/regulatory/corpus.json','utf8'));
 let calls=0;page.on('request',r=>{if(r.url().includes('/api/regulatory-evidence'))calls++;});
 await page.goto('/');await page.getByRole('button',{name:'Prüfungen',exact:true}).click();
 const research=page.getByRole('region',{name:'Recherche und unveränderliche Snapshots'});
 await research.getByText('Anforderungen für einen neuen Einsatz suchen',{exact:true}).click();
 await research.getByRole('button',{name:'Kandidaten suchen (offline)',exact:true}).click();
 await expect(research.getByRole('status')).toContainText('Kandidaten gespeichert');
 await expect(research.locator('.regulatory-citation')).toHaveCount(8);
 const proposal=research.locator('.regulatory-citation').first();await proposal.locator(':scope > summary').click();
 await expect(proposal.getByRole('blockquote')).toHaveText(corpus.citations[0].quote);
 await proposal.getByLabel('Prüferkennung').fill('synthetic-reviewer');
 await proposal.getByLabel('Begründung der Quellenzuordnung und Anwendbarkeit').fill('Synthetische Prüfung: Der Einsatzumfang ist noch nicht belegt.');
 await proposal.getByLabel('Verbleibende Unsicherheit').fill('Historische Quelle; Datenflüsse ungeklärt.');
 await proposal.getByRole('combobox',{name:'Entscheidung',exact:true}).selectOption('approve');
 await expect(proposal.getByRole('button',{name:'Prüfentscheidung protokollieren'})).toBeDisabled();
 await proposal.getByRole('combobox',{name:'Entscheidung',exact:true}).selectOption('reject');
 await proposal.getByRole('button',{name:'Prüfentscheidung protokollieren'}).click();
 await expect(proposal.locator(':scope > summary')).toContainText('Abgelehnt');
 await proposal.getByRole('combobox',{name:'Entscheidung',exact:true}).selectOption('correct');
 await proposal.getByLabel('Korrigierte Anforderung').selectOption('security-measures');await proposal.getByLabel('Korrigierte Quellenstelle').selectOption('gdpr-32-1');
 await proposal.getByRole('button',{name:'Prüfentscheidung protokollieren'}).click();
 await expect(proposal.locator(':scope > summary')).toContainText('Korrigiert');
 await proposal.getByRole('combobox',{name:'Entscheidung',exact:true}).selectOption('approve');
 await proposal.getByLabel('Anwendbarkeit laut Prüfung').selectOption('applicable');
 await proposal.getByLabel('Quelle unterstützt diese Anforderung').check();await proposal.getByLabel('Einsatzumfang und Gegenbelege geprüft').check();
 await proposal.getByRole('button',{name:'Prüfentscheidung protokollieren'}).click();
 await expect(proposal.locator(':scope > summary')).toContainText('Kandidat bestätigt');
 await research.getByText('Bewertung als unveränderlichen Snapshot speichern',{exact:true}).click();
 await research.getByRole('button',{name:'Snapshot erfassen',exact:true}).click();await expect(research.getByRole('table',{name:'Snapshot-Ergebnisse'}).locator('tbody tr')).toHaveCount(7);
 const event=page.waitForEvent('download');await research.getByRole('button',{name:'Snapshot exportieren',exact:true}).click();
 const download=await event,raw=await readFile(await download.path(),'utf8'),snapshot=JSON.parse(raw);
 expect(snapshot.payload.report.findings.find((f:any)=>f.checkId==='processor-contract').outcome).toBe('gap');expect(snapshot.payload.research.reviews).toHaveLength(3);expect(snapshot.payload.report.draft.runs).toEqual([]);
 await page.getByRole('button',{name:'3 · Bericht',exact:true}).click();await expect(page.getByRole('table',{name:'Prüfergebnisse'}).locator('tbody tr')).toHaveCount(7);
 await page.reload();await page.getByRole('button',{name:'Prüfungen',exact:true}).click();await research.getByText('Bewertung als unveränderlichen Snapshot speichern',{exact:true}).click();
 await research.getByRole('button',{name:'Snapshot offline prüfen',exact:true}).click();await expect(research.getByRole('status')).toHaveText('Snapshot offline reproduziert.');
 await mkdir('results/regulatory-discovery',{recursive:true});await page.screenshot({path:'results/regulatory-discovery/snapshot.png',fullPage:true});
 // Tampering must leave the stored archive intact.
 snapshot.payload.report.findings[0].outcome='satisfied';
 await research.getByLabel('Recherche oder Snapshot importieren').setInputFiles({name:'changed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))});await expect(research.getByRole('status')).toContainText('Vorgang abgelehnt');
 await research.getByRole('button',{name:'Snapshot offline prüfen',exact:true}).click();await expect(research.getByRole('status')).toHaveText('Snapshot offline reproduziert.');
 expect(calls).toBe(0);
});

test('English discovery imports a complete self-contained snapshot without replacing the active assessment',async({page})=>{
 await page.goto('/');await page.getByLabel('Sprache wählen').selectOption('en');await page.getByRole('button',{name:'Assessments',exact:true}).click();
 const research=page.getByRole('region',{name:'Discovery and immutable snapshots'});await research.getByText('Save assessment as an immutable snapshot',{exact:true}).click();
 await research.getByRole('button',{name:'Capture snapshot',exact:true}).click();
 const event=page.waitForEvent('download');await research.getByRole('button',{name:'Export snapshot',exact:true}).click();const file=await event;const raw=await readFile(await file.path(),'utf8');
 await page.getByLabel('Example case').selectOption('claude-documented');
 await research.getByLabel('Import research or snapshot').setInputFiles({name:'snapshot.json',mimeType:'application/json',buffer:Buffer.from(raw)});
 await expect(research.getByRole('status')).toHaveText('Import verified. Active assessment unchanged.');await expect(page.getByLabel('Example case')).toHaveValue('claude-documented');
 await expect(research.getByRole('combobox',{name:'Saved snapshot',exact:true}).locator('option')).toHaveCount(1);
});
