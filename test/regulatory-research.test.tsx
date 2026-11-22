import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRegulatoryAssessment,freshDraft,regulatoryReport,regulatoryRetrieval,companyPassages} from '../src/ui/regulatory';
import {appendBatch,appendResearch,appendReview,appendSnapshot,captureAssessment,currentRegulatoryResources,discoverRequirements,effectiveProposal,readResearch,readSnapshots,RESEARCH_KEYS,replayAssessment,reviewProposal,sha256,validateDiscovery,validateResearch,type ReviewInput} from '../src/regulatory/research';

const at='2026-11-17T12:00:00Z';
const query={scenarioId:'claude-pilot',description:'SYNTHETIC: An internal assistant uses named employee accounts. Provider roles and transfers are unknown.',terms:['Auftragsverarbeiter','Risiko'],modelRuns:[]};
const review:ReviewInput={decision:'reject',reviewer:'synthetic-reviewer',rationale:'The scope is not established by the supplied description.',uncertainty:'Historical edition and real data flows need specialist review.',applicability:'unknown',sourceSupportsRequirement:false,scopeReviewed:false};
const store=()=>{const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},values};};
async function reseal<T extends {id:string;payload:unknown}>(record:T){record.id='sha256:'+await sha256(record.payload);return record;}

test('controlled discovery reuses both retrievers, exact known citations and bounded provenance, with unknown applicability',async()=>{
 const before=regulatoryReport(freshDraft()),b=await discoverRequirements(query,undefined,at);
 assert.equal(b.payload.proposals.length,8);assert.deepEqual(await validateDiscovery(JSON.parse(JSON.stringify(b))),b);
 for(const p of b.payload.proposals){
  assert.equal(p.applicability.state,'unknown');assert.ok(p.applicability.reason.en&&p.applicability.uncertainty.en);assert.deepEqual(p.applicability.rule,p.requirement.rule);
  assert.ok(p.retrieval.text||p.retrieval.graph);assert.equal(p.citation.id,p.provenance.relationship.citationId);
  for(const strategy of ['text','graph'] as const){const hit=regulatoryRetrieval(p.requirement.id,strategy,query.terms).hits.find(h=>h.citationId===p.citation.id);assert.deepEqual(p.retrieval[strategy]?.hit??null,hit??null);}
 }
 assert.ok(b.payload.diagnostics.every(d=>d.graph.visited<=200&&d.graph.edgesExamined<=1000));
 assert.deepEqual(regulatoryReport(freshDraft()),before);
 assert.equal((await discoverRequirements(query,undefined,at)).id,b.id);
 await assert.rejects(()=>discoverRequirements({...query,terms:[]}));
});

test('lexical misses and unrelated use cases never prove applicability through curated graph links',async()=>{
 const b=await discoverRequirements({...query,description:'SYNTHETIC: A public weather-display kiosk with no deployment details.',terms:['nonexistent-legal-term']},undefined,at);
 assert.ok(b.payload.proposals.length);assert.ok(b.payload.proposals.every(p=>p.retrieval.text===null&&p.applicability.state==='unknown'));
 const p=b.payload.proposals[0];assert.equal(effectiveProposal(b,p.id,[]).status,'pending');assert.equal(effectiveProposal(b,p.id,[]).activatesRules,false);
 const rejected=await reviewProposal(b,p.id,[],{...review,rationale:'This data-processing provision has no established relevance to this kiosk.'},at);
 assert.equal(effectiveProposal(b,p.id,[rejected]).status,'reject');
});

test('fabricated quotations, real but irrelevant substitute provisions, invented paths and asserted applicability are rejected even after resealing',async()=>{
 const b=await discoverRequirements(query,undefined,at);
 for(const change of [(v:any)=>v.payload.proposals[0].citation.quote+=' invented',(v:any)=>v.payload.proposals[0].citation=v.payload.proposals.at(-1).citation,(v:any)=>v.payload.proposals[0].retrieval.graph.hit.path.steps.push({edgeId:'fabricated'}),(v:any)=>v.payload.proposals[0].applicability.state='applicable']){
  const changed=structuredClone(b);change(changed);await reseal(changed);await assert.rejects(()=>validateDiscovery(changed));
 }
 const pageTamper=structuredClone(b);(pageTamper.payload.resources.knowledge as any).pages[0].text+=' forged statutory language';await reseal(pageTamper);await assert.rejects(()=>validateDiscovery(pageTamper));
});

test('human rejection, correction and explicit approval form an append-only chain without activating rules',async()=>{
 const b=await discoverRequirements(query,undefined,at),p=b.payload.proposals[0],original=JSON.stringify(p),before=regulatoryReport(freshDraft());
 await assert.rejects(()=>reviewProposal(b,p.id,[],{...review,decision:'approve'},at),/Approval/);
 const rejected=await reviewProposal(b,p.id,[],review,at);
 const corrected=await reviewProposal(b,p.id,[rejected],{...review,decision:'correct',correction:{requirementId:'security-measures',citationId:'gdpr-32-1'},rationale:'Synthetic reviewer corrects the candidate to the security requirement and its exact source.'},at);
 assert.equal(effectiveProposal(b,p.id,[rejected,corrected]).status,'correct');
 const approved=await reviewProposal(b,p.id,[rejected,corrected],{...review,decision:'approve',applicability:'applicable',sourceSupportsRequirement:true,scopeReviewed:true},at);
 const result=effectiveProposal(b,p.id,[rejected,corrected,approved]);assert.equal(result.requirement.id,'security-measures');assert.equal(result.citation.id,'gdpr-32-1');assert.equal(result.status,'approve');assert.equal(result.activatesRules,false);
 assert.equal(JSON.stringify(p),original);assert.deepEqual(regulatoryReport(freshDraft()),before);
 await validateResearch({batches:[b],reviews:[rejected,corrected,approved]});
 await assert.rejects(()=>validateResearch({batches:[b],reviews:[approved]}));
 await assert.rejects(()=>validateResearch({batches:[b],reviews:[corrected,rejected,approved]}));
 await assert.rejects(()=>reviewProposal(b,p.id,[],{...review,decision:'correct',correction:{requirementId:'security-measures',citationId:'fabricated'}},at));
});

test('a response from another evidence question cannot become an AI regulatory proposal or bypass review',async()=>{
 const recording=JSON.parse(await readFile(new URL('./fixtures/jev-evidence-config-recorded.json',import.meta.url),'utf8'));
 const forged={checkId:'processor-contract',evidenceId:companyPassages(query.scenarioId)[0].id,corpusFingerprint:(currentRegulatoryResources().knowledge as any).fingerprint,questionVersion:'evidence-1',assessment:recording.assessment};
 await assert.rejects(()=>discoverRequirements({...query,modelRuns:[forged]}));
 const b=await discoverRequirements(query,undefined,at),changed=structuredClone(b);changed.payload.proposals[0].provenance.origin='ai_assisted';await reseal(changed);await assert.rejects(()=>validateDiscovery(changed));
});

test('snapshots replay their pinned definitions after working definitions change and retain exact source/evidence/model metadata',async()=>{
 const b=await discoverRequirements(query,undefined,at),r=await reviewProposal(b,b.payload.proposals[0].id,[],review,at);
 const snapshot=await captureAssessment(freshDraft('claude-documented'),{batches:[b],reviews:[r]},undefined,at),original=JSON.stringify(snapshot);
 const changed=currentRegulatoryResources();const catalog=changed.requirements as any;catalog.version='synthetic-test-change';catalog.requirements[0].version='2';catalog.requirements[0].rule='gap';
 const a=createRegulatoryAssessment(changed);assert.equal(a.assessRegulatory(a.freshDraft('claude-documented'))[0].outcome,'gap');
 const replayed=await replayAssessment(JSON.parse(original));assert.equal(replayed.payload.report.findings[0].outcome,'satisfied');assert.equal(JSON.stringify(replayed),original);
 assert.deepEqual(replayed.payload.report.draft.runs,[]);assert.deepEqual(replayed.payload.report.draft.facts,freshDraft('claude-documented').facts);assert.equal(replayed.payload.research.reviews[0].id,r.id);
 assert.throws(()=>{replayed.payload.report.findings[0].outcome='gap';},TypeError);
});

test('contradictory or missing evidence stays unknown; forged conclusions, changed rules and source versions cannot replay as the old snapshot',async()=>{
 const snapshot=await captureAssessment(freshDraft('claude-conflict'),undefined,undefined,at);assert.ok(snapshot.payload.report.findings.every(f=>f.outcome==='unknown'));
 for(const change of [(s:any)=>s.payload.report.findings[0].outcome='not_applicable',(s:any)=>s.payload.report.definitions.catalog.requirements[0].rule='satisfied',(s:any)=>s.payload.resources.knowledge.sources[0].revision='invented-edition',(s:any)=>s.payload.engineVersion='unsupported-engine']){
  const changed=structuredClone(snapshot);change(changed);await reseal(changed);await assert.rejects(()=>replayAssessment(changed));
 }
 const changed=structuredClone(snapshot);changed.payload.report.draft.facts.personalData.note='changed';await assert.rejects(()=>replayAssessment(changed),/checksum/);
});

test('browser persistence and exports retain immutable records, reject corrupt imports and never overwrite existing captures',async()=>{
 const storage=store(),b=await discoverRequirements(query,undefined,at),r=await reviewProposal(b,b.payload.proposals[0].id,[],review,at);
 await appendBatch(storage,b);await appendReview(storage,r);const saved=storage.getItem(RESEARCH_KEYS.research);await appendResearch(storage,await readResearch(storage));assert.equal(storage.getItem(RESEARCH_KEYS.research),saved);
 const snapshot=await captureAssessment(freshDraft(),await readResearch(storage),undefined,at);await appendSnapshot(storage,snapshot);const first=storage.getItem(RESEARCH_KEYS.snapshots);await appendSnapshot(storage,snapshot);assert.equal(storage.getItem(RESEARCH_KEYS.snapshots),first);
 const next=await captureAssessment(freshDraft('claude-documented'),undefined,undefined,at);await appendSnapshot(storage,next);const all=await readSnapshots(storage);assert.equal(all.length,2);assert.deepEqual(all[0],snapshot);
 const exportValue=JSON.parse(JSON.stringify(all[0]));assert.deepEqual(await replayAssessment(exportValue),snapshot);
 storage.setItem(RESEARCH_KEYS.snapshots,'invalid json');await assert.rejects(()=>appendSnapshot(storage,next));assert.equal(storage.getItem(RESEARCH_KEYS.snapshots),'invalid json');
 storage.setItem(RESEARCH_KEYS.research,'invalid json');await assert.rejects(()=>appendBatch(storage,b));assert.equal(storage.getItem(RESEARCH_KEYS.research),'invalid json');
});

test('offline CLI reproduces an exported pinned snapshot, is deterministic and refuses overwrite',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jev-regulatory-replay-'));
 const run=(args:string[])=>execFileSync(process.execPath,['--import','tsx','--import','./test-support/offline.js','scripts/regulatory-snapshot.ts',...args],{encoding:'utf8',stdio:'pipe'});
 const demo=join(dir,'demo'),replay=join(dir,'replay');assert.match(run(['--demo','--out',demo]),/No inference/);
 const file=join(demo,'snapshot.json'),original=await readFile(file,'utf8');assert.match(run(['--input',file,'--out',replay]),/Verified sha256:/);
 assert.equal(await readFile(join(replay,'snapshot.json'),'utf8'),original);assert.throws(()=>run(['--demo','--out',demo]));assert.equal(await readFile(file,'utf8'),original);
 const metadata=JSON.parse(await readFile(join(replay,'replay.json'),'utf8'));assert.equal(metadata.inferenceCalls,0);assert.equal(metadata.legalValidation,false);
});
