import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import corpus from '../examples/regulatory/corpus.json';
import requirements from '../examples/regulatory/requirements.json';
import useCases from '../examples/regulatory/use-cases.json';
import scenarios from '../examples/regulatory/scenarios.json';
import questions from '../examples/regulatory/questions.json';
import {loadRequirements,loadUseCases} from '../src/assessment/configuration';
import {evaluateRequirements} from '../src/assessment/engine';
import {createRegulatoryKnowledge} from '../src/regulatory/knowledge';
import {createRegulatoryAssessment} from '../src/ui/regulatory';

const resources=()=>structuredClone({knowledge:corpus,requirements,useCases,scenarios,questions});
const make=()=>createRegulatoryAssessment(resources());
const outcomes=(a:ReturnType<typeof make>,scenario:string)=>Object.fromEntries(a.assessRegulatory(a.freshDraft(scenario)).map(f=>[f.checkId,f.outcome]));

test('versioned requirement and use-case loaders validate references before execution',()=>{
 const c=loadRequirements(requirements,corpus.citations.map(c=>c.id));
 assert.equal(c.requirements.length,7);assert.equal(loadUseCases(useCases,c).useCases.length,2);
 for(const change of [(r:any)=>r.requirements[0].rule={op:'execute',code:'return true'},(r:any)=>r.requirements[0].rule={op:'require',facts:['invented']},(r:any)=>r.relationships[0].citationId='invented',(r:any)=>r.requirements.push(r.requirements[0]),(r:any)=>r.requirements[0].version='']){
  const r=structuredClone(requirements);change(r);assert.throws(()=>loadRequirements(r,corpus.citations.map(c=>c.id)));
 }
 const u=structuredClone(useCases);u.useCases[0].requirementIds.push('invented');assert.throws(()=>loadUseCases(u,c));
 const badContext=resources();badContext.scenarios[0].context.accessRoute='unconfigured';assert.throws(()=>createRegulatoryAssessment(badContext));
});

test('knowledge loading rejects out-of-page spans even if a permissive string slice would match',()=>{
 const c=structuredClone(corpus),citation=c.citations[0],page=c.pages.find(p=>p.id===citation.pageId)!;
 citation.start=0;citation.end=page.text.length+1;citation.quote=page.text;
 assert.throws(()=>createRegulatoryKnowledge(c),/citation/);
});

test('two use cases reuse the same versioned requirements and pure evaluator',()=>{
 const a=make(),internal=a.freshDraft('internal-assistant-pilot');
 const ids=a.checksForScenario(internal.scenarioId).map(c=>c.id);
 assert.deepEqual(ids,['purpose-basis','security-measures','privacy-risk','employee-data']);
 for(const id of ids)assert.deepEqual(a.checksForScenario('claude-pilot').find(c=>c.id===id),a.checkById(id));
 const direct=evaluateRequirements(a.catalog,a.useCaseForScenario(internal.scenarioId),{facts:internal.facts,context:internal.context,expectedContext:{},availableCitationIds:new Set(corpus.citations.map(c=>c.id)),review:()=>undefined});
 assert.deepEqual(direct.map(f=>f.outcome),a.assessRegulatory(internal).map(f=>f.outcome));
 assert.deepEqual(outcomes(a,internal.scenarioId),{'purpose-basis':'satisfied','security-measures':'gap','privacy-risk':'not_applicable','employee-data':'unknown'});
 const report=a.regulatoryReport(internal);assert.equal(report.kind,'internal-assistant-assessment');assert.equal(report.useCaseId,'internal-assistant');assert.deepEqual(report.draft.context,{});
 assert.equal(report.definitions.useCase.id,'internal-assistant');assert.match(a.regulatoryMarkdown(internal),/internal AI assistant/i);
 assert.throws(()=>a.buildRegulatoryRequest(internal.scenarioId,'processor-contract',a.companyPassages(internal.scenarioId)[0].id));
});

test('configured applicability distinguishes missing, negative and documented excluded scope',()=>{
 const a=make(),d=a.freshDraft('internal-assistant-pilot');
 d.facts.personalData={value:'no',note:'',evidenceIds:[]};assert.equal(a.assessRegulatory(d)[0].outcome,'unknown');
 d.facts=a.blankFacts();d.facts.personalData={value:'no',note:'Reviewer documents no personal data within this synthetic scope.',evidenceIds:[]};
 assert.ok(a.assessRegulatory(d).every(f=>f.outcome==='not_applicable'));
 d.facts.personalData.value='yes';d.facts.purpose={value:'no',note:'Purpose explicitly not documented.',evidenceIds:[]};
 assert.equal(a.assessRegulatory(d)[0].outcome,'gap');
 delete d.facts.purpose;assert.equal(a.assessRegulatory(d)[0].outcome,'unknown');
});

test('conflicting facts and insufficient or uncertain evidence block conclusions generically',()=>{
 const a=make();assert.ok(a.assessRegulatory(a.freshDraft('claude-conflict')).every(f=>f.outcome==='unknown'));
 for(const judgment of ['contradicted','insufficient_evidence','uncertain'] as const){
  const d=a.freshDraft('internal-assistant-pilot'),evidenceId=d.facts.purpose.evidenceIds[0];
  d.reviews[JSON.stringify(['purpose-basis',evidenceId])]={judgment,comment:'Needs clarification',updatedAt:'2026-11-17T12:00:00Z'};
  assert.equal(a.assessRegulatory(d)[0].outcome,'unknown');
 }
 const missing=a.assessRegulatory(a.freshDraft('internal-assistant-pilot'),[]);assert.ok(missing.every(f=>f.outcome==='unknown'&&f.citationErrors.length));
});

test('AI-created mappings retain provenance and cannot act as rules or structural edges without recorded review',()=>{
 const r=resources(),links=r.requirements.relationships.filter(l=>l.requirementId==='purpose-basis'),link=links[0];
 for(const l of links){l.provenance.origin='ai_generated';l.provenance.record='synthetic-unreviewed-proposal';}
 const a=createRegulatoryAssessment(r),d=a.freshDraft('internal-assistant-pilot');
 assert.equal(a.assessRegulatory(d)[0].outcome,'unknown');assert.deepEqual(a.assessRegulatory(d)[0].relationshipErrors,links.map(l=>l.id));
 assert.equal(a.regulatoryRetrieval('purpose-basis','graph',['no_lexical_match']).hits.length,0);
 assert.throws(()=>a.buildRegulatoryRequest(d.scenarioId,'purpose-basis',a.companyPassages(d.scenarioId)[0].id),/review/);
 assert.equal(a.regulatoryReport(d).findings[0].relationships[0].provenance.record,link.provenance.record);
 (link as any).verification='reviewed';assert.throws(()=>createRegulatoryAssessment(r),/review record/);
 for(const l of links){(l as any).verification='reviewed';(l as any).review={reviewer:'synthetic-test-reviewer',reviewedAt:'2026-11-17T12:00:00Z',note:'Test-only engineering review; not legal ground truth.'};}
 const reviewed=createRegulatoryAssessment(r);assert.equal(reviewed.assessRegulatory(reviewed.freshDraft(d.scenarioId))[0].outcome,'satisfied');
 assert.ok(reviewed.regulatoryRetrieval('purpose-basis','graph',['no_lexical_match']).hits.length);
});

test('a new requirement, question and use case load from data without changing the evaluator or UI',()=>{
 const r=resources();
 r.requirements.questions.push({id:'policyOwner',label:{de:'Ist eine zuständige Person benannt?',en:'Is a policy owner documented?'}});
 r.requirements.requirements.push({...r.requirements.requirements[0],id:'policy-owner',version:'1',title:'Zuständigkeit',titleEn:'Policy ownership',statement:'The synthetic policy identifies an owner.',rule:{op:'require',facts:['policyOwner']}} as any);
 r.requirements.relationships.push({...r.requirements.relationships[0],id:'synthetic-owner-link',requirementId:'policy-owner',provenance:{origin:'curated',record:'test-only-extension',rationale:'Synthetic engineering mapping; not a legal interpretation.'}});
 r.useCases.useCases.push({...r.useCases.useCases[1],id:'test-extension',defaultScenarioId:'extension-pilot',requirementIds:['policy-owner'],constraintIds:[],scopeQuestions:['policyOwner'],reportKind:'extension-assessment'});
 const s=structuredClone(r.scenarios[3]);s.id='extension-pilot';s.useCaseId='test-extension';s.documents=s.documents.map(d=>({...d,systemId:s.id}));s.facts={} as any;
 r.scenarios.push(s);const a=createRegulatoryAssessment(r),d=a.freshDraft(s.id);
 assert.equal(a.assessRegulatory(d)[0].outcome,'unknown');d.facts.policyOwner={value:'yes',note:'Synthetic reviewer names an owner.',evidenceIds:[]};
 assert.equal(a.assessRegulatory(d)[0].outcome,'satisfied');assert.equal(a.regulatoryReport(d).useCaseId,'test-extension');
 assert.equal(a.freshDraft('claude-pilot').facts.policyOwner.value,'unknown');assert.equal(a.checksForScenario('claude-pilot').length,7);
 const report=a.regulatoryReport(d);assert.deepEqual(a.importRegulatoryReport(JSON.parse(JSON.stringify(report))),d);
});

test('pre-refactor Claude report migrates without changing facts, original evidence or citations',async()=>{
 const a=make(),legacy=JSON.parse(await readFile(new URL('./fixtures/regulatory-report-v1.json',import.meta.url),'utf8'));
 const d=a.importRegulatoryReport(legacy);assert.equal(d.schemaVersion,2);assert.equal(d.context.accessRoute,legacy.draft.plan);
 assert.deepEqual(d.facts,legacy.draft.facts);assert.deepEqual(d.reviews,legacy.draft.reviews);assert.deepEqual(d.runs,legacy.draft.runs);
 const report=a.regulatoryReport(d);assert.deepEqual(report.corpus,legacy.corpus);
 assert.deepEqual(report.findings.map(f=>({id:f.checkId,outcome:f.outcome,citations:f.citations})),legacy.findings.map((f:any)=>({id:f.checkId,outcome:f.outcome,citations:f.citations})));
 const withReview=structuredClone(legacy),key=JSON.stringify(['purpose-basis',a.companyPassages(d.scenarioId)[0].id]);
 withReview.draft.reviews[key]={judgment:'supported',comment:'Synthetic review saved before migration.',updatedAt:'2026-11-17T12:00:00Z'};
 assert.deepEqual(a.importRegulatoryReport(withReview).reviews,withReview.draft.reviews);
 const bad=structuredClone(legacy);bad.findings[0].citations[0].quote+=' altered';assert.throws(()=>a.importRegulatoryReport(bad));
 const changed=structuredClone(legacy);changed.findings[0].outcome='gap';assert.throws(()=>a.importRegulatoryReport(changed));
 const modern=structuredClone(report);modern.definitions.catalog.requirements[0].version='changed';assert.throws(()=>a.importRegulatoryReport(modern));
});
