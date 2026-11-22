import {configurationIdentity} from '../question-config.js';
import {ENGINE_VERSION} from '../assessment/engine';
import {ruleFacts, type Labels} from '../assessment/configuration';
import {createRegulatoryAssessment, regulatoryCatalog, regulatoryCorpus, regulatoryQuestions, regulatoryScenarios, regulatoryUseCases, type RegulatoryDraft, type RegulatoryRun} from '../ui/regulatory';
import trustedCorpora from '../../examples/regulatory/trusted-corpora.json';

export const DISCOVERY_VERSION='regulatory-discovery-1';
export const RESEARCH_KEYS={research:'jev.regulatory-research.v1',snapshots:'jev.regulatory-snapshots.v1'};
type Resources=Parameters<typeof createRegulatoryAssessment>[0];
type Assessment=ReturnType<typeof createRegulatoryAssessment>;
type Sealed<T>={schemaVersion:1;id:string;payload:T};
export type DiscoveryRequest={scenarioId:string;description:string;terms:string[];modelRuns:RegulatoryRun[]};
type Proposal={id:string;verification:'unverified';requirement:Assessment['catalog']['requirements'][number];citation:Assessment['regulatoryCorpus']['citations'][number];source:Assessment['regulatoryCorpus']['sources'][number];provenance:{origin:'retrieval'|'ai_assisted';relationship:Assessment['catalog']['relationships'][number];modelJudgments:RegulatoryRun[]};applicability:{state:'unknown';rule:unknown;requiredFacts:string[];reason:Labels;uncertainty:Labels};retrieval:{text:any;graph:any}};
type BatchPayload={kind:'regulatory-proposals';version:string;createdAt:string;resources:Resources;request:DiscoveryRequest;proposals:Proposal[];diagnostics:any[]};
export type DiscoveryBatch=Sealed<BatchPayload>;
export type ReviewInput={decision:'approve'|'reject'|'correct';reviewer:string;rationale:string;uncertainty:string;applicability:'applicable'|'not_applicable'|'unknown';sourceSupportsRequirement:boolean;scopeReviewed:boolean;correction?:{requirementId:string;citationId:string}};
type ReviewPayload=ReviewInput&{kind:'regulatory-proposal-review';batchId:string;proposalId:string;previousReviewId:string|null;createdAt:string};
export type ProposalReview=Sealed<ReviewPayload>;
export type Research={batches:DiscoveryBatch[];reviews:ProposalReview[]};
type SnapshotPayload={kind:'regulatory-assessment-snapshot';engineVersion:string;createdAt:string;resources:Resources;report:ReturnType<Assessment['regulatoryReport']>;research:Research};
export type AssessmentSnapshot=Sealed<SnapshotPayload>;
const same=(a:unknown,b:unknown)=>configurationIdentity(a)===configurationIdentity(b);
const text=(v:unknown,max=4000):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max;
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export async function sha256(value:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(configurationIdentity(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function seal<T>(payload:T):Promise<Sealed<T>>{const copy=structuredClone(payload);return freeze({schemaVersion:1,id:'sha256:'+await sha256(copy),payload:copy});}
async function verifySeal(value:any){if(!value||value.schemaVersion!==1||Object.keys(value).sort().join()!=='id,payload,schemaVersion'||value.id!=='sha256:'+await sha256(value.payload))throw Error('Changed immutable record or invalid checksum.');}
export function currentRegulatoryResources():Resources{return structuredClone({knowledge:regulatoryCorpus,requirements:regulatoryCatalog,useCases:regulatoryUseCases,scenarios:regulatoryScenarios,questions:regulatoryQuestions});}

// Trust anchors are versioned project data, never supplied by an imported report.
async function knowledgeIntegrity(a:Assessment){
 const {fingerprint,...payload}=a.regulatoryCorpus;
 if(await sha256(payload)!==fingerprint||!trustedCorpora.some(c=>c.fingerprint===fingerprint&&c.version===a.regulatoryCorpus.version))throw Error('Unknown or modified regulatory corpus.');
 for(const p of a.regulatoryCorpus.pages){const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p.text)))).map(b=>b.toString(16).padStart(2,'0')).join('');if(digest!==p.sha256)throw Error('Changed regulatory page.');}
}
function discoveryPayload(resources:Resources,request:DiscoveryRequest,createdAt:string):BatchPayload{
 const a=createRegulatoryAssessment(resources);
 if(!date(createdAt)||!request||Object.keys(request).sort().join()!=='description,modelRuns,scenarioId,terms'||!text(request.description)||!Array.isArray(request.terms)||!request.terms.length||request.terms.length>12||!request.terms.every(t=>text(t,100))||new Set(request.terms).size!==request.terms.length||!Array.isArray(request.modelRuns)||request.modelRuns.length>50)throw Error('Provide a synthetic description and 1–12 distinct search terms.');
 a.scenarioById(request.scenarioId);for(const run of request.modelRuns)a.validateRun(run,request.scenarioId);
 const diagnostics:any[]=[],proposals:Proposal[]=[];
 for(const requirement of a.catalog.requirements){
  const textResult=a.regulatoryRetrieval(requirement.id,'text',request.terms),graphResult=a.regulatoryRetrieval(requirement.id,'graph',request.terms);
  diagnostics.push({requirementId:requirement.id,text:textResult.diagnostics,graph:graphResult.diagnostics});
  // Expand only known, provenance-bearing candidate mappings; lexical hits outside
  // a mapping are not evidence of a new legal obligation.
  for(const relationship of a.catalog.relationships.filter(r=>r.requirementId===requirement.id)){
   const textHit=textResult.hits.find(h=>h.citationId===relationship.citationId),graphHit=graphResult.hits.find(h=>h.citationId===relationship.citationId);
   if(!textHit&&!graphHit)continue;
   const citation=a.assertCitation(a.citationById(relationship.citationId)),source=a.regulatoryCorpus.sources.find(s=>s.id===citation.sourceId)!;
   const models=request.modelRuns.filter(r=>r.checkId===requirement.id&&r.assessment.request.state.legalReferences.some(c=>c.id===citation.id));
   proposals.push({id:requirement.id+'::'+citation.id,verification:'unverified',requirement,citation,source,provenance:{origin:models.some(r=>r.assessment.response.answers.evidence_judgment.choice==='supported')?'ai_assisted':'retrieval',relationship,modelJudgments:models},applicability:{state:'unknown',rule:requirement.rule,requiredFacts:ruleFacts(requirement.rule),reason:{de:'Suchkandidat aus einer vorhandenen Quellenzuordnung. Die genannten Fakten und der neue Einsatzumfang müssen geprüft werden.',en:'Retrieval candidate from an existing source mapping. The listed facts and the new use-case scope need review.'},uncertainty:{de:'Keine bestätigte Anwendbarkeit. Kuratierte Verknüpfung, historischer Quellenstand und mögliche widersprüchliche Belege benötigen Prüfung. Jev bewertet gegebenenfalls nur den ursprünglichen Beleg, nicht diese neue Beschreibung.',en:'Applicability is not confirmed. Curated links, historical source editions and potentially conflicting evidence need review. Any Jev judgment concerns its original passage, not this new description.'}},retrieval:{text:textHit?{rank:textResult.hits.findIndex(h=>h.citationId===citation.id)+1,hit:textHit}:null,graph:graphHit?{rank:graphResult.hits.findIndex(h=>h.citationId===citation.id)+1,hit:graphHit}:null}});
  }
 }
 return structuredClone({kind:'regulatory-proposals',version:DISCOVERY_VERSION,createdAt,resources,request,proposals,diagnostics});
}
export async function discoverRequirements(request:DiscoveryRequest,resources=currentRegulatoryResources(),createdAt=new Date().toISOString()):Promise<DiscoveryBatch>{const a=createRegulatoryAssessment(resources);await knowledgeIntegrity(a);return seal(discoveryPayload(resources,request,createdAt));}
export async function validateDiscovery(value:unknown):Promise<DiscoveryBatch>{
 const b=value as DiscoveryBatch;await verifySeal(b);
 if(b.payload?.kind!=='regulatory-proposals'||b.payload.version!==DISCOVERY_VERSION)throw Error('Unsupported discovery version.');
 await knowledgeIntegrity(createRegulatoryAssessment(b.payload.resources));
 if(!same(b.payload,discoveryPayload(b.payload.resources,b.payload.request,b.payload.createdAt)))throw Error('Fabricated proposal, citation, applicability or retrieval provenance.');
 return freeze(structuredClone(b));
}
function reviewPayload(batch:DiscoveryBatch,proposalId:string,history:ProposalReview[],input:ReviewInput,createdAt:string):ReviewPayload{
 const p=batch.payload.proposals.find(p=>p.id===proposalId);if(!p)throw Error('Unknown proposal.');
 if(!date(createdAt)||!input||Object.keys(input).sort().join()!==['decision','reviewer','rationale','uncertainty','applicability','sourceSupportsRequirement','scopeReviewed',...(input.correction?['correction']:[])].sort().join()||!['approve','reject','correct'].includes(input.decision)||!['applicable','not_applicable','unknown'].includes(input.applicability)||!text(input.reviewer,120)||!text(input.rationale)||!text(input.uncertainty)||typeof input.sourceSupportsRequirement!=='boolean'||typeof input.scopeReviewed!=='boolean')throw Error('Review needs identity, reasoning, uncertainty and applicability.');
 if(input.decision==='approve'&&(!input.sourceSupportsRequirement||!input.scopeReviewed||input.applicability==='unknown'))throw Error('Approval needs explicit source and scope confirmation and an applicability decision.');
 const a=createRegulatoryAssessment(batch.payload.resources);
 if(input.decision==='correct'){
  if(!input.correction||Object.keys(input.correction).sort().join()!=='citationId,requirementId')throw Error('Provide a corrected requirement and citation.');
  a.checkById(input.correction.requirementId);a.assertCitation(a.citationById(input.correction.citationId));
 }else if(input.correction)throw Error('Corrections require a separate correction event before approval.');
 const previous=history.filter(r=>r.payload.batchId===batch.id&&r.payload.proposalId===proposalId).at(-1);
 return {...structuredClone(input),kind:'regulatory-proposal-review',batchId:batch.id,proposalId,previousReviewId:previous?.id??null,createdAt};
}
export async function reviewProposal(batch:DiscoveryBatch,proposalId:string,history:ProposalReview[],input:ReviewInput,createdAt=new Date().toISOString()):Promise<ProposalReview>{await validateResearch({batches:[batch],reviews:history.filter(r=>r.payload.batchId===batch.id)});return seal(reviewPayload(batch,proposalId,history,input,createdAt));}
export function effectiveProposal(batch:DiscoveryBatch,proposalId:string,reviews:ProposalReview[]){
 const proposal=batch.payload.proposals.find(p=>p.id===proposalId);if(!proposal)throw Error('Unknown proposal.');
 const history=reviews.filter(r=>r.payload.batchId===batch.id&&r.payload.proposalId===proposalId),correction=history.findLast(r=>r.payload.decision==='correct')?.payload.correction;
 const a=createRegulatoryAssessment(batch.payload.resources),requirement=a.checkById(correction?.requirementId??proposal.requirement.id),citation=a.citationById(correction?.citationId??proposal.citation.id);
 const status:ReviewInput['decision']|'pending'=history.at(-1)?.payload.decision??'pending';
 return {proposal,requirement,citation,source:a.regulatoryCorpus.sources.find(s=>s.id===citation.sourceId)!,history,status,review:history.at(-1)?.payload??null,activatesRules:false as const};
}
export async function validateResearch(value:Research){
 if(!value||Object.keys(value).sort().join()!=='batches,reviews'||!Array.isArray(value.batches)||value.batches.length>10||!Array.isArray(value.reviews)||value.reviews.length>100||new Set(value.batches.map(b=>b.id)).size!==value.batches.length||new Set(value.reviews.map(r=>r.id)).size!==value.reviews.length)throw Error('Invalid or excessive research archive.');
 for(const batch of value.batches)await validateDiscovery(batch);
 const verified:ProposalReview[]=[];
 for(const review of value.reviews){await verifySeal(review);const {kind,batchId,proposalId,previousReviewId,createdAt,...input}=review.payload;const batch=value.batches.find(b=>b.id===batchId);if(kind!=='regulatory-proposal-review'||!batch||!same(review.payload,reviewPayload(batch,proposalId,verified,input,createdAt)))throw Error('Changed, reordered or orphaned review.');verified.push(review);}
 return freeze(structuredClone(value));
}
export async function captureAssessment(draft:RegulatoryDraft,research:Research={batches:[],reviews:[]},resources=currentRegulatoryResources(),createdAt=new Date().toISOString()):Promise<AssessmentSnapshot>{
 const a=createRegulatoryAssessment(resources);await knowledgeIntegrity(a);await validateResearch(research);if(!date(createdAt))throw Error('Invalid capture time.');
 return seal({kind:'regulatory-assessment-snapshot',engineVersion:ENGINE_VERSION,createdAt,resources,report:a.regulatoryReport(draft),research});
}
export async function replayAssessment(value:unknown):Promise<AssessmentSnapshot>{
 const snapshot=value as AssessmentSnapshot;await verifySeal(snapshot);const p=snapshot.payload;
 if(p?.kind!=='regulatory-assessment-snapshot'||p.engineVersion!==ENGINE_VERSION||!date(p.createdAt))throw Error('Unsupported assessment engine version.');
 const a=createRegulatoryAssessment(p.resources);await knowledgeIntegrity(a);await validateResearch(p.research);
 a.importRegulatoryReport(p.report);return freeze(structuredClone(snapshot));
}
type StorageLike=Pick<Storage,'getItem'|'setItem'>;
export async function readResearch(storage:Pick<Storage,'getItem'>){return validateResearch(JSON.parse(storage.getItem(RESEARCH_KEYS.research)??'{"batches":[],"reviews":[]}'));}
export async function appendResearch(storage:StorageLike,incoming:Research){const existing=await readResearch(storage);await validateResearch(incoming);const batches=[...existing.batches,...incoming.batches.filter(b=>!existing.batches.some(v=>v.id===b.id))],reviews=[...existing.reviews,...incoming.reviews.filter(r=>!existing.reviews.some(v=>v.id===r.id))];const result=await validateResearch({batches,reviews});storage.setItem(RESEARCH_KEYS.research,JSON.stringify(result));return result;}
export async function appendBatch(storage:StorageLike,batch:DiscoveryBatch){return appendResearch(storage,{batches:[batch],reviews:[]});}
export async function appendReview(storage:StorageLike,review:ProposalReview){const r=await readResearch(storage);if(r.reviews.some(v=>v.id===review.id))return r;const result=await validateResearch({batches:r.batches,reviews:[...r.reviews,review]});storage.setItem(RESEARCH_KEYS.research,JSON.stringify(result));return result;}
export async function readSnapshots(storage:Pick<Storage,'getItem'>):Promise<AssessmentSnapshot[]>{const values=JSON.parse(storage.getItem(RESEARCH_KEYS.snapshots)??'[]');if(!Array.isArray(values)||values.length>10||new Set(values.map(s=>s.id)).size!==values.length)throw Error('Invalid snapshot archive.');return Promise.all(values.map(replayAssessment));}
export async function appendSnapshot(storage:StorageLike,value:AssessmentSnapshot){const current=await readSnapshots(storage),snapshot=await replayAssessment(value);if(current.some(s=>s.id===snapshot.id))return;if(current.length>=10)throw Error('Snapshot archive full; export before continuing.');storage.setItem(RESEARCH_KEYS.snapshots,JSON.stringify([...current,snapshot]));}
