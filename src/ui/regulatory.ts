import corpusData from '../../examples/regulatory/corpus.json';
import scenarioData from '../../examples/regulatory/scenarios.json';
import questionData from '../../examples/regulatory/questions.json';
import requirementData from '../../examples/regulatory/requirements.json';
import useCaseData from '../../examples/regulatory/use-cases.json';
import { segmentDocument, retrievePassages, type EvidenceDocument, type EvidenceControl, type Passage } from './evidence';
import { buildEvidenceGraph, searchEvidenceGraph, DEFAULT_GRAPH_LIMITS, type GraphManifest } from './evidence-graph';
import { scoreEvidenceRows, judgmentCategories, type JudgmentCategory } from './evidence-runs';
import { configurationIdentity, validateQuestionConfiguration } from '../question-config.js';
import { createRegulatoryKnowledge, type Citation } from '../regulatory/knowledge';
import { loadRequirements, loadUseCases, ruleFacts, relationshipEligible, type Fact, type FactValue, type Outcome } from '../assessment/configuration';
import { evaluateRequirements, ENGINE_VERSION } from '../assessment/engine';

export type {Fact,FactValue,Outcome};
export type FactId=string;
export type Facts=Record<string,Fact>;
export type Scenario={id:string;version:string;useCaseId:string;title:string;titleEn:string;purpose:string;context:Record<string,string>;documents:EvidenceDocument[];facts:Facts};
export type HumanReview={judgment:JudgmentCategory|'uncertain';comment:string;updatedAt:string};
type RegulatoryRequest={model:string;state:{control:{id:string;statement:string};passage:Passage;legalReferences:Citation[]};questions:typeof questionData.questions};
export type RegulatoryRun={checkId:string;evidenceId:string;corpusFingerprint:string;questionVersion:string;assessment:{schemaVersion:number;profile:string;mode:string;startedAt:string;sdkVersion:string;requestId:string|null;latencyMs:number;request:RegulatoryRequest;response:{model:string;answers:Record<string,any>;usage:Record<string,number|null>}}};
export type RegulatoryDraft={schemaVersion:2;scenarioId:string;context:Record<string,string>;facts:Facts;reviews:Record<string,HumanReview>;runs:RegulatoryRun[]};
export const REGULATORY_KEY='jev.regulatory-draft.v1'; // Keep storage identity; schema 1 is migrated on read.
type Resources={knowledge:unknown;requirements:unknown;useCases:unknown;scenarios:unknown;questions:unknown};
const same=(a:unknown,b:unknown)=>configurationIdentity(a)===configurationIdentity(b);

/** Composition boundary. New definitions are loaded here; the evaluator has no imports of them. */
export function createRegulatoryAssessment(resources:Resources){
 const knowledge=createRegulatoryKnowledge(resources.knowledge),corpus=knowledge.corpus;
 const catalog=loadRequirements(resources.requirements,corpus.citations.map(c=>c.id));
 const useCases=loadUseCases(resources.useCases,catalog);
 const questions=validateQuestionConfiguration(resources.questions,'evidence') as typeof questionData;
 const scenarios=structuredClone(resources.scenarios) as Scenario[];
 const ruleVersion=catalog.id+'@'+catalog.version;
 if(!Array.isArray(scenarios)||!scenarios.length||new Set(scenarios.map(s=>s.id)).size!==scenarios.length)throw Error('Invalid scenario registry.');
 function useCaseById(id:string){const u=useCases.useCases.find(u=>u.id===id);if(!u)throw Error('Unknown use case.');return u;}
 function scenarioById(id:string){const s=scenarios.find(s=>s.id===id);if(!s)throw Error('Unknown scenario.');return s;}
 function useCaseForScenario(id:string){return useCaseById(scenarioById(id).useCaseId);}
 function checkById(id:string){const r=catalog.requirements.find(r=>r.id===id);if(!r)throw Error('Unknown check.');return {...r,inputs:ruleFacts(r.rule),citations:[...new Set(catalog.relationships.filter(link=>link.requirementId===id).map(link=>link.citationId))]};}
 function checksForScenario(id:string){return useCaseForScenario(id).requirementIds.map(checkById);}
 function companyPassages(id:string){return scenarioById(id).documents.flatMap(segmentDocument);}
 function blankFacts():Facts{return Object.fromEntries(catalog.questions.map(q=>[q.id,{value:'unknown',evidenceIds:[],note:''} as Fact]));}
 function validateFacts(value:unknown,scenarioId:string):Facts {
  const facts=value as Facts,passages=companyPassages(scenarioId),ids=new Set(catalog.questions.map(q=>q.id));
  if(!facts||typeof facts!=='object'||Array.isArray(facts))throw Error('Invalid facts.');
  const normalized=blankFacts();
  for(const [id,f]of Object.entries(facts)){
   if(!ids.has(id)||!f||Object.keys(f).sort().join()!=='evidenceIds,note,value'||!['yes','no','unknown'].includes(f.value)||!Array.isArray(f.evidenceIds)||f.evidenceIds.length>5||new Set(f.evidenceIds).size!==f.evidenceIds.length||!f.evidenceIds.every(p=>passages.some(x=>x.id===p))||typeof f.note!=='string'||f.note.length>1000)throw Error('Invalid fact or evidence reference.');
   normalized[id]=structuredClone(f);
  }
  return normalized;
 }
 function validateContext(context:unknown,scenarioId:string):Record<string,string>{
  const fields=useCaseForScenario(scenarioId).contextFields,c=context as Record<string,string>;
  if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).sort().join()!==fields.map(f=>f.id).sort().join()||!fields.every(f=>f.options.some(o=>o.value===c[f.id])))throw Error('Invalid configured context.');return structuredClone(c);
 }
 for(const s of scenarios){
  if(!s||typeof s.id!=='string'||!s.id||typeof s.version!=='string'||!s.version||![s.title,s.titleEn,s.purpose].every(v=>typeof v==='string'&&v.trim())||!Array.isArray(s.documents)||!s.documents.length||s.documents.some(d=>!d.id||!d.revision||d.systemId!==s.id||typeof d.content!=='string'||!d.content.trim()))throw Error('Invalid scenario definition.');
  useCaseById(s.useCaseId);validateContext(s.context,s.id);s.facts=validateFacts(s.facts,s.id);
  if(new Set(companyPassages(s.id).map(p=>p.id)).size!==companyPassages(s.id).length)throw Error('Duplicate scenario passage.');
 }
 for(const u of useCases.useCases)if(scenarioById(u.defaultScenarioId).useCaseId!==u.id)throw Error('Default scenario belongs to another use case.');
 function freshDraft(scenarioId=useCaseById(useCases.defaultUseCaseId).defaultScenarioId):RegulatoryDraft {const s=scenarioById(scenarioId);return {schemaVersion:2,scenarioId,context:structuredClone(s.context),facts:validateFacts(s.facts,scenarioId),reviews:{},runs:[]};}
 function buildRegulatoryRequest(scenarioId:string,checkId:string,evidenceId:string,model='jev-latest'):RegulatoryRequest {
  const passage=companyPassages(scenarioId).find(p=>p.id===evidenceId),c=checkById(checkId);
  if(!passage||!useCaseForScenario(scenarioId).requirementIds.includes(checkId))throw Error('Unknown scenario passage or unavailable requirement.');
  if(typeof model!=='string'||!model.trim())throw Error('Invalid model.');
  const links=catalog.relationships.filter(r=>r.requirementId===checkId);
  if(links.some(r=>!relationshipEligible(r)))throw Error('Unverified AI relationship requires review.');
  return {model,state:{control:{id:c.id,statement:c.statement},passage,legalReferences:c.citations.map(id=>knowledge.assertCitation(knowledge.citationById(id)))},questions:questions.questions};
 }
 function validateRun(run:RegulatoryRun,scenarioId:string){
  const a=run?.assessment,expected=buildRegulatoryRequest(scenarioId,run?.checkId,run?.evidenceId,a?.request?.model);
  if(run.corpusFingerprint!==corpus.fingerprint||run.questionVersion!==questions.version||a?.schemaVersion!==1||a.profile!=='regulatory-evidence'||a.mode!=='live'||!same(a.request,expected)||!Number.isFinite(Date.parse(a.startedAt))||typeof a.sdkVersion!=='string'||!(a.requestId===null||typeof a.requestId==='string')||!Number.isFinite(a.latencyMs)||a.latencyMs<0||typeof a.response?.model!=='string'||!a.response.model)throw Error('Invalid Jev run provenance.');
  const choice=a.response.answers?.evidence_judgment,noul=a.response.answers?.addresses_control;
  if(choice?.type!=='choice'||!judgmentCategories.includes(choice.choice)||!judgmentCategories.every(k=>Number.isFinite(choice.probabilities?.[k])&&choice.probabilities[k]>=0&&choice.probabilities[k]<=1)||Math.abs(Object.values(choice.probabilities as Record<string,number>).reduce((a,b)=>a+b,0)-1)>0.001||noul?.type!=='noul'||!Number.isFinite(noul.noul)||noul.noul<0||noul.noul>1||!a.response.usage||!Object.values(a.response.usage).every(n=>n===null||Number.isInteger(n)&&n>=0))throw Error('Invalid Jev response.');
 }
 function validateDraft(value:unknown):RegulatoryDraft {
  const raw=value as any,u=useCaseForScenario(raw?.scenarioId);
  let migrated=raw;
  if(raw?.schemaVersion===1&&u.legacy){
   if(Object.keys(raw).sort().join()!==['schemaVersion','scenarioId',u.legacy.contextProperty,'facts','reviews','runs'].sort().join())throw Error('Invalid legacy draft.');
   migrated={schemaVersion:2,scenarioId:raw.scenarioId,context:{[u.legacy.contextField]:raw[u.legacy.contextProperty]},facts:raw.facts,reviews:raw.reviews,runs:raw.runs};
  }
  const d=migrated as RegulatoryDraft;
  if(d.schemaVersion!==2||Object.keys(d).sort().join()!=='context,facts,reviews,runs,scenarioId,schemaVersion'||!d.reviews||typeof d.reviews!=='object'||Array.isArray(d.reviews)||!Array.isArray(d.runs)||d.runs.length>50)throw Error('Invalid assessment draft.');
  const normalized={...d,context:validateContext(d.context,d.scenarioId),facts:validateFacts(d.facts,d.scenarioId)};
  for(const [key,r]of Object.entries(d.reviews)){const selection=JSON.parse(key);if(!Array.isArray(selection)||selection.length!==2||!u.requirementIds.includes(selection[0])||!companyPassages(d.scenarioId).some(p=>p.id===selection[1])||!r||![...judgmentCategories,'uncertain'].includes(r.judgment)||typeof r.comment!=='string'||r.comment.length>1000||!Number.isFinite(Date.parse(r.updatedAt)))throw Error('Invalid human review.');}
  for(const run of d.runs)validateRun(run,d.scenarioId);return structuredClone(normalized);
 }
 function assessRegulatory(value:RegulatoryDraft,availableCitations=corpus.citations){
  const d=validateDraft(value);for(const c of availableCitations)knowledge.assertCitation(c);
  return evaluateRequirements(catalog,useCaseForScenario(d.scenarioId),{facts:d.facts,context:d.context,expectedContext:scenarioById(d.scenarioId).context,availableCitationIds:new Set(availableCitations.map(c=>c.id)),review:(id,evidenceId)=>d.reviews[JSON.stringify([id,evidenceId])]?.judgment}).map(f=>({...f,citations:f.citationIds.map(id=>availableCitations.find(c=>c.id===id)).filter((c):c is Citation=>!!c)}));
 }
 function regulatoryControl(id:string):EvidenceControl {const c=checkById(id);return {id:c.id,title:c.title,statement:c.statement,assessmentField:c.id,terms:c.terms};}
 function regulatoryRetrieval(checkId:string,strategy:'text'|'graph'='graph',terms?:string[],scenarioId?:string){
  const c=checkById(checkId);if(scenarioId&&!useCaseForScenario(scenarioId).requirementIds.includes(checkId))throw Error('Unavailable requirement.');
  const control={...regulatoryControl(checkId),...(terms===undefined?{}:{terms})};
  const docs=corpus.citations.map(ref=>({id:'law-'+ref.id,revision:corpus.sources.find(s=>s.id===ref.sourceId)!.sha256,systemId:'regulatory',title:ref.pinpoint,content:'# '+ref.pinpoint+'\n\n'+ref.quote}));
  const passages=docs.flatMap(segmentDocument),relationships=catalog.relationships.filter(r=>r.requirementId===checkId);
  if(strategy==='text')return {strategy,relationships,hits:retrievePassages(passages,control).map(x=>({...x,citationId:x.passage.documentId.slice(4)})),diagnostics:{visited:0,edgesExamined:0,limitsReached:[] as string[]},paths:[]};
  const manifest:GraphManifest={version:ruleVersion,currentRevisions:Object.fromEntries(docs.map(d=>[d.id,d.revision])),controls:[control],relationships:relationships.filter(relationshipEligible).map(link=>{const d=docs.find(d=>d.id==='law-'+link.citationId)!,p=passages.find(p=>p.documentId===d.id)!;return {id:link.id,kind:'control_section' as const,fromControl:checkId,target:{documentId:d.id,revision:d.revision,section:p.section},source:{documentId:d.id,revision:d.revision,section:p.section,quote:p.text.slice(0,80)}};})};
  const graph=buildEvidenceGraph(docs,[control],manifest);graph.corpusVersion=corpus.version;
  const result=searchEvidenceGraph(graph,{...DEFAULT_GRAPH_LIMITS,systemId:'regulatory',controlId:checkId,includeArchived:false});
  return {strategy,relationships,hits:result.hits.map(x=>({...x,citationId:x.passage.documentId.slice(4)})),diagnostics:{visited:result.visited,edgesExamined:result.edgesExamined,limitsReached:result.limitsReached},paths:result.hits.map(h=>h.path)};
 }
 function regulatoryEvaluation(draft:RegulatoryDraft){
  const latest=new Map<string,RegulatoryRun>();for(const run of draft.runs)latest.set(JSON.stringify([run.checkId,run.evidenceId,run.assessment.response.model]),run);
  const rows=[...latest].map(([key,run])=>({runId:key,caseId:run.checkId,passage:companyPassages(draft.scenarioId).find(p=>p.id===run.evidenceId)!,expected:draft.reviews[JSON.stringify([run.checkId,run.evidenceId])]?.judgment??null,predicted:run.assessment.response.answers.evidence_judgment.choice as JudgmentCategory}));
  return {...scoreEvidenceRows(rows),rows,policy:'Latest run per check/passage/actual model; uncertain and unlabeled excluded. Models shown per row.'};
 }
 function regulatoryReport(value:RegulatoryDraft){
  const draft=validateDraft(value),scenario=scenarioById(draft.scenarioId),useCase=useCaseForScenario(draft.scenarioId);
  return {schemaVersion:2,kind:useCase.reportKind,rules:ruleVersion,engineVersion:ENGINE_VERSION,useCaseId:useCase.id,definitions:{catalog,useCase},questionConfiguration:questions,corpusFingerprint:corpus.fingerprint,scope:useCase.scope,limitations:useCase.limitations,draft,scenario,corpus,findings:assessRegulatory(draft),classificationEvaluation:regulatoryEvaluation(draft)};
 }
 function importRegulatoryReport(value:unknown):RegulatoryDraft {
  const report=value as any,draft=validateDraft(report?.draft),u=useCaseForScenario(draft.scenarioId);
  if(report.schemaVersion===1&&u.legacy){
   const originalScenario={...scenarioById(draft.scenarioId)} as any;originalScenario[u.legacy.contextProperty]=originalScenario.context[u.legacy.contextField];delete originalScenario.useCaseId;delete originalScenario.version;delete originalScenario.context;
   const actual=assessRegulatory(draft);
   if(report.kind!==u.legacy.reportKind||report.rules!==u.legacy.rules||report.corpusFingerprint!==corpus.fingerprint||!same(report.corpus,corpus)||!same(report.scenario,originalScenario)||!same(report.questionConfiguration,questions)||!Array.isArray(report.findings)||report.findings.length!==actual.length||!actual.every(f=>{const old=report.findings.find((r:any)=>r.checkId===f.checkId);return old&&old.outcome===f.outcome&&same(old.citations,f.citations);}))throw Error('Changed legacy source or inconsistent conclusions.');
   return draft;
  }
  if(report.schemaVersion!==2||!same(report,regulatoryReport(draft)))throw Error('Changed definition, citation or inconsistent conclusions.');return draft;
 }
 function regulatoryMarkdown(draft:RegulatoryDraft){
  const report=regulatoryReport(draft),u=useCaseForScenario(draft.scenarioId);
  return ['# '+u.heading.en,report.scope,'Historical legal snapshots; specialist review required. No overall compliance verdict.',`Scenario: ${draft.scenarioId}; context: ${JSON.stringify(draft.context)}; rules: ${ruleVersion}; engine: ${ENGINE_VERSION}; corpus: ${corpus.fingerprint}`,...report.findings.flatMap(f=>[`\n## ${checkById(f.checkId).titleEn}: ${f.outcome}`,`Action: ${f.actionEn}`,`Missing: ${f.missing.join(', ')||'—'}; conflicts: ${f.contradictions.join('; ')||'—'}`,`Relationship issues: ${f.relationshipErrors.join(', ')||'—'}`,...Object.entries(f.facts).map(([id,v])=>`Fact ${id}: ${v.value}; note: ${v.note}; evidence: ${v.evidenceIds.join(', ')}`),...f.citations.map(ref=>{const s=corpus.sources.find(s=>s.id===ref.sourceId)!;return `${ref.pinpoint}; ${s.filename}, PDF p.${ref.pdfPage}, UTF-16 [${ref.start},${ref.end}), SHA-256 ${s.sha256}\n${s.url}\n\n> ${ref.quote.replaceAll('\n','\n> ')}`;}),...f.evidenceIds.map(id=>{const p=companyPassages(draft.scenarioId).find(p=>p.id===id)!;return `Synthetic evidence ${p.id} (${p.section}):\n> ${p.text}`;})]),...u.limitations.map(item=>item.en)].join('\n\n');
 }
 return {catalog,useCases,regulatoryCorpus:corpus,regulatoryScenarios:scenarios,regulatoryChecks:catalog.requirements.map(r=>checkById(r.id)),factDefinitions:catalog.questions.map(q=>[q.id,q.label.de,q.label.en] as const),regulatoryQuestions:questions,RULE_VERSION:ruleVersion,...knowledge,blankFacts,scenarioById,useCaseById,useCaseForScenario,checksForScenario,checkById,companyPassages,validateFacts,freshDraft,buildRegulatoryRequest,validateRun,validateDraft,assessRegulatory,regulatoryControl,regulatoryRetrieval,regulatoryEvaluation,regulatoryReport,importRegulatoryReport,regulatoryMarkdown};
}
const assessment=createRegulatoryAssessment({knowledge:corpusData,requirements:requirementData,useCases:useCaseData,scenarios:scenarioData,questions:questionData});
export const {catalog:regulatoryCatalog,useCases:regulatoryUseCases,regulatoryCorpus,regulatoryScenarios,regulatoryChecks,factDefinitions,regulatoryQuestions,RULE_VERSION,blankFacts,scenarioById,useCaseById,useCaseForScenario,checksForScenario,checkById,companyPassages,validateFacts,freshDraft,buildRegulatoryRequest,validateRun,validateDraft,assessRegulatory,regulatoryControl,regulatoryRetrieval,regulatoryEvaluation,regulatoryReport,importRegulatoryReport,regulatoryMarkdown,citationById,assertCitation}=assessment;
