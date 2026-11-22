import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {freezeProtocol,validateDataset,validateProtocol,makeRequest,sourceSpans,baselineExtract,retrieveSourceUnits,citationChecks,compareCatalog,hash,validateRecord,extractRecord,validateFieldReviews} from '../src/experiments/obligation-discovery';
import {evaluateExperiment} from '../src/experiments/obligation-report';
const read=(name:string)=>JSON.parse(readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const dir='examples/regulatory/obligation-experiment/';
const dataset=read(dir+'dataset.json'),config=read(dir+'questions.json'),catalog=read('examples/regulatory/requirements.json'),expectations=read(dir+'design-expectations.json');
const protocol=freezeProtocol(dataset,config,catalog,{designExpectations:hash(expectations)});

test('source experiment has uncatalogued provisions, negative controls and a bounded eight-call plan',()=>{
 assert.equal(validateDataset(dataset).units.length,11);assert.equal(dataset.livePlan.length,8);assert.equal(dataset.useCases.length,4);assert.equal(expectations.humanConfirmed,false);
 assert.ok(dataset.units.some((u:any)=>u.id==='gdpr-31'));assert.ok(dataset.units.some((u:any)=>u.id==='bsi-recommendation'));
 for(const u of dataset.units)for(const span of sourceSpans(u)){assert.equal(u.page.text.slice(span.start,span.end),span.quote);assert.ok(sourceSpans(u).length<=24);}
 const bsi=dataset.units.find((u:any)=>u.id==='bsi-recommendation');assert.ok(bsi.page.originalPageStartUTF16>0);assert.match(bsi.page.originalPageTextSha256,/^[a-f0-9]{64}$/);
});
test('native Jev questions extract source spans without catalog or provisional-label inputs',()=>{
 const req=makeRequest(protocol,'gdpr-28-1','claude-adoption');assert.equal(Object.keys(req.questions).length,11);assert.equal(req.questions.entity_span.type,'choice');assert.equal(req.questions.entity_present.type,'noul');
 assert.equal(Object.hasOwn(req.state,'comparisonCatalog'),false);assert.equal(Object.hasOwn(req.state,'expected'),false);
 const changed=structuredClone(protocol);changed.payload.comparisonCatalog={relationships:[]};changed.hash=hash(changed.payload);assert.deepEqual(makeRequest(changed,'gdpr-28-1','claude-adoption'),req);
 const changedCase=makeRequest(protocol,'gdpr-28-1','offline-kiosk');assert.notEqual(changedCase.state.useCase.description,req.state.useCase.description);assert.deepEqual(changedCase.questions,req.questions);
});
test('fabricated citations, changed source versions and changed applicability questions fail validation',()=>{
 for(const mutate of [(d:any)=>d.units[0].citation.quote+='fabricated',(d:any)=>d.units[0].citation.pdfPage++,(d:any)=>d.units[0].source.revision='invented',(d:any)=>d.units[0].page.text+='changed']){const d=structuredClone(dataset);mutate(d);assert.throws(()=>validateDataset(d));}
 const p=structuredClone(protocol);p.payload.questionConfiguration.applicability.instructions+='wrong';assert.throws(()=>validateProtocol(p));
});
test('irrelevant retrieval and classification remain separate, bounded and offline',()=>{
 const r=evaluateExperiment(protocol,[],expectations);assert.equal(r.primaryMetrics.retrievalAccuracy,null);assert.equal(r.primaryMetrics.independentlyReviewedPairs,0);assert.equal(r.objectiveChecks.records,0);assert.equal(r.baseline.length,44);
 const empty=r.retrieval.find(r=>r.useCaseId==='offline-kiosk')!;assert.equal(empty.exploratoryUnconfirmedMetrics.text.recallAt5,null);assert.equal(empty.exploratoryUnconfirmedMetrics.text.recallDenominator,0);
 for(const c of dataset.useCases){const result=retrieveSourceUnits(dataset,c.id);assert.ok(result.diagnostics.visited<=200);assert.ok(result.diagnostics.edgesExamined<=1000);for(const h of [...result.text,...result.graph])assert.ok(dataset.units.some((u:any)=>u.id===h.unitId));}
 const changed=structuredClone(expectations);changed.rows[0].relation='not_relevant';assert.throws(()=>evaluateExperiment(protocol,[],changed));
});
test('exact citation checks reject invented role text, and catalog matching is post-extraction article overlap only',()=>{
 const unit=dataset.units.find((u:any)=>u.id==='gdpr-28-1');const candidate=baselineExtract(unit,'claude-adoption');assert.equal(citationChecks(candidate,dataset).valid,true);
 const fabricated=structuredClone(candidate);fabricated.fields.action.span!.quote='Invented legal duty';assert.equal(citationChecks(fabricated,dataset).valid,false);
 const comparison=compareCatalog([candidate],catalog)[0];assert.equal(comparison.comparison,'same_article_not_proven_equivalent');assert.ok(comparison.manualRequirementIds.includes('processor-contract'));
 const cooperation=baselineExtract(dataset.units.find((u:any)=>u.id==='gdpr-31'),'claude-adoption');assert.equal(compareCatalog([cooperation],catalog)[0].manualRequirementIds.length,0);
});
test('CLI refuses live inference without opt-in, before reading credentials or sending requests',()=>{
 if(!existsSync(new URL('../'+dir+'protocol.json',import.meta.url)))return;
 const result=spawnSync(process.execPath,['--import','tsx','--import','./test-support/offline.js','scripts/obligation-experiment.ts','run'],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/explicit --live/);
});
test('recorded extraction responses replay offline, preserve probabilities, and reject inconsistent provenance',()=>{
 const location=new URL('../'+dir+'recorded-run/',import.meta.url);assert.ok(existsSync(location),'Actual recorded responses are required, never replaced with mock Jev outputs.');
 const p=read(dir+'protocol.json'),records=readdirSync(location).filter(n=>/^record-\d+\.json$/.test(n)).map(n=>read(dir+'recorded-run/'+n));assert.ok(records.length>0);
 for(const record of records){validateRecord(p,record);const candidate=extractRecord(p,record);assert.equal(candidate.verification,'unverified');assert.equal(candidate.productionEligible,false);assert.deepEqual(candidate.record.assessment.response,record.assessment.response);assert.equal(citationChecks(candidate,dataset).valid,true);
  const changed=structuredClone(record);changed.assessment.request.state.provision.quote+='fabricated';assert.throws(()=>validateRecord(p,changed));
  const invalid=structuredClone(record);invalid.assessment.response.answers.source_function.choice='fabricated';assert.throws(()=>validateRecord(p,invalid));
 }
 assert.throws(()=>evaluateExperiment(p,[records[0],records[0]],expectations));
 assert.throws(()=>validateFieldReviews(records,{humanConfirmed:false,reviewer:'reviewer',rows:[]}));
 const result=evaluateExperiment(p,records,expectations);assert.equal(result.objectiveChecks.citationsValid,records.length);assert.equal(result.primaryMetrics.extractionAccuracy,null);
});
test('frozen real experiment replays to the same report hash and every recording retains exact bytes',()=>{
 const checksums=read(dir+'recording-checksums.json');for(const [name,expected]of Object.entries(checksums.files)){assert.equal(createHash('sha256').update(readFileSync(new URL('../'+dir+name,import.meta.url))).digest('hex'),expected,name);}
 const records=readdirSync(new URL('../'+dir+'recorded-run/',import.meta.url)).filter(n=>/^record-\d+\.json$/.test(n)).sort().map(n=>read(dir+'recorded-run/'+n));assert.equal(records.length,8);
 const p=read(dir+'protocol.json'),result=evaluateExperiment(p,records,expectations);assert.equal(hash(result),read(dir+'observations/manifest.json').resultsHash);
 assert.equal(result.objectiveChecks.allUnverified,true);assert.equal(result.objectiveChecks.tokens.input,25262);assert.equal(result.objectiveChecks.tokens.output,5845);
});
test('real applicability failures and non-binding controls remain visible instead of becoming approved requirements',()=>{
 const p=read(dir+'protocol.json'),records=readdirSync(new URL('../'+dir+'recorded-run/',import.meta.url)).filter(n=>/^record-\d+\.json$/.test(n)).map(n=>read(dir+'recorded-run/'+n));const r=evaluateExperiment(p,records,expectations);
 for(const unitId of ['gdpr-31','gdpr-35-1']){const c=r.caseAnalysis.find(c=>c.id.endsWith('::'+unitId))!;assert.equal(c.exploratoryDifferences.applicability,true);assert.equal(c.citationValidation.valid,true);}
 for(const unitId of ['geschgehg-definition','bsi-recommendation','internal-policy'])assert.equal(r.candidates.find(c=>c.unitId===unitId)!.statutoryObligationCandidate,false);
 const multiple=r.candidates.find(c=>c.unitId==='gdpr-28-2')!;assert.notDeepEqual(multiple.fields.action.span,multiple.fields.conditions.span);assert.ok(multiple.uncertainty.some(s=>s.includes('multiple obligations')));
 assert.deepEqual(r.retrieval[0].text.map(h=>h.unitId),r.retrieval[0].graph.map(h=>h.unitId));assert.ok(!r.retrieval[0].text.some(h=>h.unitId==='gdpr-28-1'));
});
test('independent human field reviews use actual answers, exclude uncertainty and do not change original records',()=>{
 const p=read(dir+'protocol.json'),records=[read(dir+'recorded-run/record-4.json'),read(dir+'recorded-run/record-5.json')],before=JSON.stringify(records);
 // Synthetic reviewer events test arithmetic and validation only; not human ground truth.
 const reviews={humanConfirmed:true,reviewer:'synthetic-test-reviewer',rows:[{id:'claude-adoption::gdpr-31',fieldReviews:{applicability:{judgment:'incorrect',comment:'Synthetic test event',expectedChoice:'not_relevant'}}},{id:'claude-adoption::gdpr-35-1',fieldReviews:{applicability:{judgment:'uncertain',comment:'Synthetic test event',expectedChoice:'needs_information'}}}]};
 const result=evaluateExperiment(p,records,expectations,reviews);assert.equal(result.primaryMetrics.reviewedFieldAgreement.applicability.denominator,1);assert.equal(result.primaryMetrics.reviewedFieldAgreement.applicability.matching,0);assert.equal(result.primaryMetrics.independentlyReviewedPairs,2);assert.equal(JSON.stringify(records),before);
 const duplicate=structuredClone(reviews);duplicate.rows.push(duplicate.rows[0]);assert.throws(()=>validateFieldReviews(records,duplicate));
 const invalid=structuredClone(reviews);invalid.rows[0].fieldReviews.applicability.expectedChoice='invented';assert.throws(()=>validateFieldReviews(records,invalid));
});
