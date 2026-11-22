import {createHash} from 'node:crypto';
import {choice,noul} from '@typesafe-ai/sdk';
import corpus from '../../examples/regulatory/corpus.json';
import {configurationIdentity} from '../question-config.js';
import {retrievePassages,segmentDocument,type EvidenceDocument,type EvidenceControl} from '../ui/evidence';
import {buildEvidenceGraph,searchEvidenceGraph,DEFAULT_GRAPH_LIMITS,type GraphManifest} from '../ui/evidence-graph';
import {validateReview} from '../ui/reviews';

export const EXPERIMENT_VERSION='source-obligation-experiment-1';
export const ROLES=['entity','action','conditions','exceptions'] as const;
export const KINDS=['binding_obligation','permission','exception','definition','recommendation','internal_control','descriptive_fact','unclear'] as const;
export const RELATIONS=['potentially_relevant','not_relevant','needs_information'] as const;
export const hash=(value:unknown)=>createHash('sha256').update(configurationIdentity(value)).digest('hex');
export type Unit={id:string;source:any;page:any;citation:{id:string;sourceId:string;pageId:string;pdfPage:number;pinpoint:string;start:number;end:number;quote:string}};
export type Dataset={schemaVersion:number;id:string;corpusFingerprint:string;units:Unit[];useCases:{id:string;description:string;terms:string[]}[];livePlan:{unitId:string;useCaseId:string}[];limits:{maxCalls:number;maxSpans:number;maxUnitChars:number};[key:string]:any};
export type Span={id:string;start:number;end:number;quote:string};
export type Protocol={schemaVersion:1;hash:string;payload:{version:string;dataset:Dataset;questionConfiguration:any;comparisonCatalog:any;sourceHashes:Record<string,string>;policy:any}};
export function validateDataset(d:Dataset){
 if(d.schemaVersion!==1||d.corpusFingerprint!==corpus.fingerprint||d.units.length>16||d.useCases.length>6||d.livePlan.length>8||d.limits.maxCalls!==8||d.limits.maxSpans!==24||d.limits.maxUnitChars!==4000||new Set(d.units.map(u=>u.id)).size!==d.units.length||new Set(d.useCases.map(c=>c.id)).size!==d.useCases.length)throw Error('Invalid bounded dataset.');
 for(const u of d.units){const c=u.citation,p=u.page;if(!c.quote||c.quote.length>4000||c.start<0||c.end<=c.start||c.end>p.text.length||p.text.slice(c.start,c.end)!==c.quote||c.sourceId!==u.source.id||c.pageId!==p.id||c.pdfPage!==p.page||!Number.isInteger(c.start)||!Number.isInteger(c.end)||createHash('sha256').update(p.text).digest('hex')!==p.sha256)throw Error('Invalid source citation.');
  const known=corpus.sources.find(s=>s.id===u.source.id);
  if(known){if(hash(known)!==hash(u.source))throw Error('Changed source metadata.');const original=corpus.pages.find(p=>p.id===u.page.id);if(original&&hash(original)!==hash(p))throw Error('Changed legal page.');if(!original&&(!p.originalPageTextSha256||!Number.isInteger(p.originalPageStartUTF16)||u.source.kind==='binding_law'))throw Error('Unverified extension page.');}
  else if(u.source.kind!=='internal_control'||!u.source.url.startsWith('synthetic:'))throw Error('Unknown source.');
 }
 for(const pair of d.livePlan)if(!d.units.some(u=>u.id===pair.unitId)||!d.useCases.some(c=>c.id===pair.useCaseId))throw Error('Unknown planned case.');
 if(new Set(d.livePlan.map(c=>c.useCaseId+'::'+c.unitId)).size!==d.livePlan.length)throw Error('Duplicate planned request.');return d;
}
// Same mechanically produced option pool for every role. No manually defined
// requirement, reference label or annotated role span is used to build it.
export function sourceSpans(u:Unit):Span[]{
 const text=u.citation.quote,result:Span[]=[];const add=(start:number,end:number)=>{while(start<end&&/\s/.test(text[start]))start++;while(end>start&&/\s/.test(text[end-1]))end--;if(end-start<3||result.some(s=>s.start===u.citation.start+start&&s.end===u.citation.start+end))return;const quote=text.slice(start,end),prefix=quote.toLowerCase().replace(/[^a-z0-9äöüß]+/g,'_').slice(0,38);result.push({id:'span_'+prefix+'_'+result.length,start:u.citation.start+start,end:u.citation.start+end,quote});};
 add(0,text.length);
 let start=0;for(const m of text.matchAll(/[;,]|\.(?=\s+[A-ZÄÖÜ(]|$)/g)){add(start,m.index!+1);start=m.index!+1;}add(start,text.length);
 return result.slice(0,24);
}
export function freezeProtocol(dataset:Dataset,questionConfiguration:any,comparisonCatalog:any,sourceHashes:Record<string,string>):Protocol{
 validateDataset(dataset);
 const payload={version:EXPERIMENT_VERSION,dataset:structuredClone(dataset),questionConfiguration:structuredClone(questionConfiguration),comparisonCatalog:structuredClone(comparisonCatalog),sourceHashes,policy:{model:'jev-latest',maxCalls:8,retries:0,presenceThreshold:0.7,absenceThreshold:0.3,oneCandidatePerProvision:true,independentHumanGroundTruth:false,approval:'All candidates remain unverified; never modifies production catalog.'}};
 return {schemaVersion:1,hash:hash(payload),payload};
}
export function validateProtocol(p:Protocol){if(p.schemaVersion!==1||p.hash!==hash(p.payload)||p.payload.version!==EXPERIMENT_VERSION||p.payload.policy.maxCalls!==8||p.payload.policy.retries!==0)throw Error('Changed experiment protocol.');validateDataset(p.payload.dataset);return p;}
export function makeRequest(p:Protocol,unitId:string,useCaseId:string){
 validateProtocol(p);const unit=p.payload.dataset.units.find(u=>u.id===unitId),useCase=p.payload.dataset.useCases.find(c=>c.id===useCaseId);if(!unit||!useCase)throw Error('Unknown source/use case.');
 const config=p.payload.questionConfiguration,spans=sourceSpans(unit),options=Object.fromEntries([['not_stated','This role is not explicitly stated in the selected provision.'],...spans.map(s=>[s.id,s.quote])]);
 const questions:Record<string,any>={source_function:choice(config.sourceFunction.instructions,config.sourceFunction.criteria),contains_obligation:noul(config.containsObligation.instructions,config.containsObligation.criteria),applicability:choice(config.applicability.instructions,config.applicability.criteria)};
 for(const role of ROLES){questions[role+'_span']=choice(config.roles[role].selection,options);questions[role+'_present']=noul(config.roles[role].presence,config.roles[role].criteria);}
 return {model:p.payload.policy.model,state:{source:{id:unit.source.id,kind:unit.source.kind,revision:unit.source.revision,fileSha256:unit.source.sha256},provision:unit.citation,spanOptions:spans,useCase:{id:useCase.id,description:useCase.description}},questions};
}
export function validateRecord(p:Protocol,r:any){
 const request=makeRequest(p,r.unitId,r.useCaseId),a=r.assessment;
 if(r.schemaVersion!==1||r.protocolHash!==p.hash||!a||a.profile!=='regulatory-obligation-experiment'||a.mode!=='live'||hash(a.request)!==hash(request)||!a.response?.model||!Number.isFinite(a.latencyMs)||a.latencyMs<0||!Number.isFinite(Date.parse(a.startedAt))||typeof a.sdkVersion!=='string'||!(a.requestId===null||typeof a.requestId==='string'))throw Error('Invalid model record provenance.');
 if(Object.keys(a.response.answers??{}).sort().join()!==Object.keys(request.questions).sort().join())throw Error('Missing/extra model fields.');
 for(const [field,q]of Object.entries(request.questions)){const answer=a.response.answers[field];if(q.type==='choice'){const keys=Object.keys(q.criteria);if(answer?.type!=='choice'||!keys.includes(answer.choice)||Object.keys(answer.probabilities??{}).sort().join()!==keys.sort().join()||!Object.values(answer.probabilities).every((v:any)=>Number.isFinite(v)&&v>=0&&v<=1)||Math.abs(Object.values(answer.probabilities).reduce((n:any,v:any)=>n+v,0) as number-1)>0.001)throw Error('Invalid Choice distribution.');}else if(answer?.type!=='noul'||!Number.isFinite(answer.noul)||answer.noul<0||answer.noul>1)throw Error('Invalid Noul.');}
 if(!a.response.usage||!Object.values(a.response.usage).every((n:any)=>n===null||Number.isInteger(n)&&n>=0))throw Error('Invalid token usage.');return r;
}
export function extractRecord(p:Protocol,r:any){
 validateRecord(p,r);const unit=p.payload.dataset.units.find(u=>u.id===r.unitId)!,answers=r.assessment.response.answers,spans=sourceSpans(unit),fields:Record<string,any>={},uncertainty:string[]=[];
 for(const role of ROLES){const presence=answers[role+'_present'].noul,selected=spans.find(s=>s.id===answers[role+'_span'].choice);const span=presence>=0.7?selected??null:null;fields[role]={span,presence,selectedChoice:answers[role+'_span'].choice,status:presence>=0.7?(selected?'selected':'inconsistent'):presence<=0.3?'not_stated':'uncertain'};if(!span)uncertainty.push(role+': '+fields[role].status);else if(span.quote.length===unit.citation.quote.length)uncertainty.push(role+': whole-provision span; boundary quality needs review.');}
 const kind=answers.source_function.choice,statutory=unit.source.kind==='binding_law'&&kind==='binding_obligation'&&answers.contains_obligation.noul>=0.7;
 if(unit.source.kind!=='binding_law'&&kind==='binding_obligation')uncertainty.push('Model calls non-legislation binding: statutory promotion blocked.');
 uncertainty.push('Historical source; context, cross-references and legal interpretation need human review. One candidate per provision can conflate multiple obligations.');
 return {id:r.useCaseId+'::'+r.unitId,unitId:r.unitId,useCaseId:r.useCaseId,method:'jev-source-span-selection',verification:'unverified',productionEligible:false,sourceFunction:kind,statutoryObligationCandidate:statutory,relationship:{label:answers.applicability.choice,reason:'Model judgment against the supplied synthetic use-case facts and source-conditioned roles; it is not a legal applicability decision.',conditions:fields.conditions,exceptions:fields.exceptions},fields,citation:unit.citation,source:unit.source,uncertainty,modelMetadata:{actualModel:r.assessment.response.model,requestId:r.assessment.requestId,sdkVersion:r.assessment.sdkVersion,latencyMs:r.assessment.latencyMs,usage:r.assessment.response.usage},record:r};
}
export function baselineExtract(unit:Unit,useCaseId:string){
 const spans=sourceSpans(unit),find=(re:RegExp)=>spans.slice(1).find(s=>re.test(s.quote))??null;
 const kind=unit.source.kind==='internal_control'?'internal_control':/sollten|sollte|empfohlen/i.test(unit.citation.quote)?'recommendation':/\b(muss|müssen|dürfen|verpflichtet)\b/i.test(unit.citation.quote)?'binding_obligation':'unclear';
 return {id:useCaseId+'::'+unit.id,unitId:unit.id,useCaseId,method:'deontic-marker-baseline',verification:'unverified',productionEligible:false,sourceFunction:kind,statutoryObligationCandidate:unit.source.kind==='binding_law'&&kind==='binding_obligation',relationship:{label:'needs_information',reason:'Lexical baseline cannot establish legal applicability.'},fields:{entity:{span:find(/Verantwortliche|Auftragsverarbeiter|Unternehmen|Mitarbeiter|Inhaber/)},action:{span:spans[0]},conditions:{span:find(/\b(wenn|sofern|falls|unter|bei)\b/i)},exceptions:{span:find(/\b(sofern|außer|ausgenommen|nicht erforderlich)\b/i)}},citation:unit.citation,source:unit.source,uncertainty:['Weak marker baseline; not a semantic obligation parser. Action covers whole provision.']};
}
export function retrieveSourceUnits(d:Dataset,useCaseId:string){
 const c=d.useCases.find(c=>c.id===useCaseId);if(!c)throw Error('Unknown query.');
 const documents:EvidenceDocument[]=d.units.map(u=>({id:u.id,revision:u.source.sha256,systemId:'regulatory-source-experiment',title:u.citation.pinpoint,content:'# '+u.citation.pinpoint+'\n\n'+u.citation.quote}));
 const control:EvidenceControl={id:c.id,title:c.id,statement:c.description,assessmentField:'source_relevance',terms:c.terms};
 const manifest:GraphManifest={version:EXPERIMENT_VERSION,currentRevisions:Object.fromEntries(documents.map(d=>[d.id,d.revision])),controls:[control],relationships:[]};
 const text=retrievePassages(documents.flatMap(segmentDocument),control),graph=searchEvidenceGraph(buildEvidenceGraph(documents,[control],manifest),{...DEFAULT_GRAPH_LIMITS,systemId:'regulatory-source-experiment',controlId:c.id,includeArchived:false});
 return {useCaseId,text:text.map(h=>({unitId:h.passage.documentId,hit:h})),graph:graph.hits.map(h=>({unitId:h.passage.documentId,hit:h})),diagnostics:{visited:graph.visited,edgesExamined:graph.edgesExamined,limitsReached:graph.limitsReached},relationshipPolicy:'No curated seven-requirement mappings. Graph uses source graph metadata/lexical seeds; no inferred statute links.'};
}
export function citationChecks(candidate:any,d:Dataset){const u=d.units.find(u=>u.id===candidate.unitId);if(!u||hash(candidate.citation)!==hash(u.citation)||hash(candidate.source)!==hash(u.source))return {valid:false,reason:'Changed provision/source'};for(const f of Object.values(candidate.fields) as any[])if(f.span&&(f.span.start<u.citation.start||f.span.end>u.citation.end||u.page.text.slice(f.span.start,f.span.end)!==f.span.quote))return {valid:false,reason:'Invented or out-of-provision role span'};return {valid:true,reason:'Exact source slices; semantic support is not established by citation validity.'};}
export function compareCatalog(candidates:any[],catalog:any){return candidates.map(c=>{const article=(s:string)=>s.match(/(?:Art\.|§)\s*\d+/)?.[0]??null;const related=catalog.relationships.filter((link:any)=>{const known=corpus.citations.find(ref=>ref.id===link.citationId);return known&&known.sourceId===c.source.id&&article(known.pinpoint)===article(c.citation.pinpoint);});return {candidateId:c.id,manualRequirementIds:[...new Set(related.map((r:any)=>r.requirementId))],comparison:related.length?'same_article_not_proven_equivalent':'no_same_article_in_seven_requirement_catalog',note:'Post-extraction citation comparison only; no semantic equivalence or verified novelty claim.'};});}
export function validateFieldReviews(records:any[],reviews:any){
 if(reviews?.humanConfirmed!==true||!reviews.reviewer?.trim()||!Array.isArray(reviews.rows))throw Error('Explicit independent review attestation required.');
 const seen=new Set<string>();
 for(const row of reviews.rows){const record=records.find(r=>row.id===r.useCaseId+'::'+r.unitId);if(!record||seen.has(row.id))throw Error('Unknown or duplicate reviewed prediction.');seen.add(row.id);for(const [field,review]of Object.entries(row.fieldReviews??{}))validateReview(record.assessment.response.answers[field],review as any);}return reviews;
}
