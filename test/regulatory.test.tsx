import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { regulatoryCorpus, regulatoryChecks, regulatoryScenarios, assertCitation, citationById, freshDraft, assessRegulatory, blankFacts, companyPassages, regulatoryRetrieval, regulatoryReport, importRegulatoryReport, regulatoryMarkdown, buildRegulatoryRequest, validateDraft, validateRun, regulatoryEvaluation } from '../src/ui/regulatory';
import { createRegulatoryHandler } from '../src/server/regulatory-route';
import { configuredQuestions } from '../src/server/question-builders.js';
import { regulatoryQuestions } from '../src/ui/regulatory';

test('regulatory inventory distinguishes historical law, guidance and standards; source slices and hashes are exact',()=>{
 assert.equal(regulatoryCorpus.sources.length,8);assert.equal(regulatoryCorpus.citations.length,8);
 for(const c of regulatoryCorpus.citations){assertCitation(c);const p=regulatoryCorpus.pages.find(p=>p.id===c.pageId)!;assert.equal(createHash('sha256').update(p.text).digest('hex'),p.sha256);}
 assert.equal(regulatoryCorpus.sources.filter(s=>s.kind==='technical_standard').length,3);
 assert.ok(regulatoryCorpus.sources.every(s=>s.currentness.includes('not verified')));
 const {fingerprint,...payload}=regulatoryCorpus;
 const canonical=(v:any):string=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
 assert.equal(createHash('sha256').update(canonical(payload)).digest('hex'),fingerprint);
});
test('wrong article, changed quotation, revision/page and offset cannot be accepted as a citation',()=>{
 const c=citationById('gdpr-28-3');for(const changed of [{...c,quote:c.quote+'x'},{...c,start:c.start+1},{...c,pdfPage:1},{...c,sourceId:'bdsg'},{...c,pinpoint:'DSGVO Art. 6'}])assert.throws(()=>assertCitation(changed));
});
test('all regulatory checks reuse lexical and bounded graph retrieval with source-grounded paths',()=>{
 for(const c of regulatoryChecks){const graph=regulatoryRetrieval(c.id,'graph'),text=regulatoryRetrieval(c.id,'text');for(const id of c.citations)assert.ok(graph.hits.some(h=>h.citationId===id),c.id+':'+id);assert.ok(graph.diagnostics.visited<=200);assert.ok(graph.diagnostics.edgesExamined<=1000);for(const hit of [...graph.hits,...text.hits])assertCitation(citationById(hit.citationId));}
 assert.equal(regulatoryRetrieval('processor-contract','text',['nonexistent_term']).hits.length,0);
 const structural=regulatoryRetrieval('processor-contract','graph',['nonexistent_term']);assert.ok(structural.hits.some(h=>h.citationId==='gdpr-28-3'));assert.ok(structural.paths.some(p=>p.steps.length===2));
});
test('missing retrieval/citation coverage yields unknown, never satisfied or non-applicable',()=>{
 const results=assessRegulatory(freshDraft('claude-documented'),[]);assert.ok(results.every(f=>f.outcome==='unknown'&&f.citationErrors.length));
});
test('fixed company scenarios reproduce documented, gap, unknown and scoped not-applicable outcomes',()=>{
 const pilot=Object.fromEntries(assessRegulatory(freshDraft()).map(f=>[f.checkId,f.outcome]));
 assert.equal(pilot['processor-contract'],'gap');assert.equal(pilot['security-measures'],'satisfied');assert.equal(pilot['purpose-basis'],'unknown');assert.equal(pilot['international-transfer'],'unknown');assert.equal(pilot['privacy-risk'],'gap');
 const documented=assessRegulatory(freshDraft('claude-documented'));assert.equal(documented.filter(f=>f.outcome==='satisfied').length,6);assert.equal(documented.find(f=>f.checkId==='privacy-risk')!.outcome,'not_applicable');assert.deepEqual(documented.find(f=>f.checkId==='privacy-risk')!.missing,[]);assert.ok(!documented.find(f=>f.checkId==='privacy-risk')!.activeInputs.includes('dpia'));
});
test('missing information is not an explicit negative and unsupported declarations do not satisfy checks',()=>{
 const d=freshDraft();d.facts=blankFacts();assert.ok(assessRegulatory(d).every(f=>f.outcome==='unknown'));
 d.facts.personalData={value:'no',evidenceIds:[],note:''};assert.ok(assessRegulatory(d).every(f=>f.outcome==='unknown'));
 d.facts.personalData.note='Explicit reviewer statement: no personal data in the defined scope.';
 assert.equal(assessRegulatory(d).find(f=>f.checkId==='purpose-basis')!.outcome,'not_applicable');
});
test('inconsistent personal/employee declarations and conflicting human reviews force clarification',()=>{
 assert.ok(assessRegulatory(freshDraft('claude-conflict')).filter(f=>f.checkId!=='business-secrets').every(f=>f.outcome==='unknown'&&f.contradictions.length));
 const d=freshDraft('claude-documented'),p=companyPassages(d.scenarioId)[0];d.reviews[JSON.stringify(['processor-contract',p.id])]={judgment:'contradicted',comment:'AV agreement is disputed',updatedAt:'2026-11-17T12:00:00Z'};
 assert.equal(assessRegulatory(d).find(f=>f.checkId==='processor-contract')!.outcome,'unknown');
});
test('DSFA is conditional on documented high privacy risk, not on the product name',()=>{
 const d=freshDraft('claude-documented');d.facts.highRisk.value='yes';assert.equal(assessRegulatory(d).find(f=>f.checkId==='privacy-risk')!.outcome,'unknown');
 d.facts.dpia={value:'no',evidenceIds:[],note:'Required DPIA explicitly not completed'};assert.equal(assessRegulatory(d).find(f=>f.checkId==='privacy-risk')!.outcome,'gap');
});
test('report and persistence round-trip exact sources and independent reviews; forged conclusions are rejected',()=>{
 const d=freshDraft('claude-documented');assert.deepEqual(validateDraft(JSON.parse(JSON.stringify(d))),d);
 const report=regulatoryReport(d);assert.deepEqual(importRegulatoryReport(JSON.parse(JSON.stringify(report))),d);
 const bad=structuredClone(report);bad.findings[0].outcome='gap';assert.throws(()=>importRegulatoryReport(bad));
 const wrong=structuredClone(report);wrong.corpus.citations[0].quote+=' invented';assert.throws(()=>importRegulatoryReport(wrong));
 assert.match(regulatoryMarkdown(d),/SHA-256/);assert.match(regulatoryMarkdown(d),/Synthetic evidence/);assert.match(regulatoryMarkdown(d),/No overall compliance verdict/);
});
test('native Jev preview resolves exact synthetic passage and pinned legal excerpts without inference',()=>{
 const d=freshDraft();const p=companyPassages(d.scenarioId)[0];const req=buildRegulatoryRequest(d.scenarioId,'processor-contract',p.id);
 assert.equal(req.state.passage.text,p.text);assert.equal(req.state.legalReferences[0].id,'gdpr-28-3');
 const q=configuredQuestions(regulatoryQuestions,'evidence');assert.equal(q.evidence_judgment.type,'choice');assert.equal(q.addresses_control.type,'noul');
 assert.equal(regulatoryEvaluation(d).n,0);assert.equal(regulatoryEvaluation(d).agreementRate,null);
 assert.throws(()=>buildRegulatoryRequest(d.scenarioId,'processor-contract','invented'));assert.throws(()=>validateRun({} as any,d.scenarioId));
});
test('regulatory inference uses existing origin, schema and disabled-live protections before provider execution',async()=>{
 let calls=0;const handle=createRegulatoryHandler(async()=>{calls++;throw Error('No offline inference');});
 const p=companyPassages('claude-pilot')[0];const body={scenarioId:'claude-pilot',checkId:'processor-contract',evidenceId:p.id,live:true};
 const req=(b:unknown,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/regulatory-evidence',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(b)});
 assert.equal((await handle(req(body,'https://evil.example'))).status,403);
 assert.equal((await handle(req({...body,evidenceId:'invented'}))).status,400);
 assert.equal((await handle(req({...body,sourceText:'not accepted'}))).status,400);
 const previous=process.env.JEV_LIVE_INFERENCE_ENABLED;process.env.JEV_LIVE_INFERENCE_ENABLED='false';try{assert.equal((await handle(req(body))).status,503);}finally{if(previous===undefined)delete process.env.JEV_LIVE_INFERENCE_ENABLED;else process.env.JEV_LIVE_INFERENCE_ENABLED=previous;}assert.equal(calls,0);
});
test('new legal questions cannot reuse old Jev responses as if generated for this scenario',async()=>{
 const old=JSON.parse(await readFile(new URL('./fixtures/jev-evidence-config-recorded.json',import.meta.url),'utf8'));assert.throws(()=>validateRun({checkId:'processor-contract',evidenceId:companyPassages('claude-pilot')[0].id,corpusFingerprint:regulatoryCorpus.fingerprint,questionVersion:regulatoryQuestions.version,assessment:old.assessment},'claude-pilot'));
});
