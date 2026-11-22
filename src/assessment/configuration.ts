export type FactValue = 'yes' | 'no' | 'unknown';
export type Outcome = 'satisfied' | 'gap' | 'unknown' | 'not_applicable';
export type Fact = {value:FactValue;evidenceIds:string[];note:string};
export type Labels = {de:string;en:string};
export type Rule = Outcome | {op:'branch';fact:string;yes:Rule;no:Rule} | {op:'require';facts:string[]};
export type Condition = {fact:string;equals:'yes'|'no'} | {all:Condition[]} | {any:Condition[]};
export type Requirement = {id:string;version:string;title:string;titleEn:string;terms:string[];statement:string;action:string;actionEn:string;rule:Rule};
export type Relationship = {id:string;version:string;requirementId:string;citationId:string;relation:'interpreted_from';provenance:{origin:'curated'|'ai_generated'|'source_explicit';record:string;rationale:string};verification:'unverified'|'reviewed';review?:{reviewer:string;reviewedAt:string;note:string}};
export type Constraint = {id:string;requirements:string[];message:string} & ({type:'conflict';when:Condition}|{type:'context_matches_scenario';field:string});
export type Catalog = {schemaVersion:1;id:string;version:string;questions:{id:string;label:Labels}[];requirements:Requirement[];relationships:Relationship[];constraints:Constraint[]};
export type UseCase = {id:string;version:string;label:Labels;heading:Labels;defaultScenarioId:string;scopeQuestions:string[];requirementIds:string[];constraintIds:string[];contextFields:{id:string;label:Labels;options:{value:string;label:Labels}[]}[];reportKind:string;reportFilename:string;scope:string;scopeNote:Labels;limitations:Labels[];legacy?:{rules:string;reportKind:string;contextField:string;contextProperty:string}};
export type UseCases = {schemaVersion:1;version:string;defaultUseCaseId:string;useCases:UseCase[]};
const record=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:any)=>typeof v==='string'&&v.trim().length>0&&v.length<=4000;
const id=(v:any)=>text(v)&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(v);
const list=(v:any):v is any[]=>Array.isArray(v)&&v.length<=200;
function unique(items:any[],key=(v:any)=>v){if(new Set(items.map(key)).size!==items.length)throw Error('Duplicate configuration identity.');}
function labels(v:any){if(!record(v)||!text(v.de)||!text(v.en))throw Error('Missing display labels.');}
function refs(v:any,available:Set<string>,nonempty=false){if(!list(v)||(nonempty&&!v.length)||!v.every(x=>typeof x==='string'&&available.has(x)))throw Error('Unknown configuration reference.');unique(v);}
const outcomes=new Set(['satisfied','gap','unknown','not_applicable']);
export function ruleFacts(rule:Rule):string[]{return typeof rule==='string'?[]:rule.op==='require'?[...rule.facts]:[...new Set([rule.fact,...ruleFacts(rule.yes),...ruleFacts(rule.no)])];}
export function conditionFacts(c:Condition):string[]{return 'fact'in c?[c.fact]:[...new Set(('all'in c?c.all:c.any).flatMap(conditionFacts))];}
function validateRule(v:any,questions:Set<string>,depth=0,path=new Set<object>()){
 if(depth>16)throw Error('Rule nesting limit exceeded.');
 if(typeof v==='string'){if(!outcomes.has(v))throw Error('Unknown outcome.');return;}
 if(!record(v)||path.has(v))throw Error('Invalid or cyclic rule.');path.add(v);
 if(v.op==='require'){if(Object.keys(v).sort().join()!=='facts,op')throw Error('Invalid require rule.');refs(v.facts,questions,true);}
 else if(v.op==='branch'){if(Object.keys(v).sort().join()!=='fact,no,op,yes'||!questions.has(v.fact))throw Error('Invalid branch rule.');validateRule(v.yes,questions,depth+1,path);validateRule(v.no,questions,depth+1,path);}
 else throw Error('Unsupported rule operator.');path.delete(v);
}
function validateCondition(v:any,questions:Set<string>,depth=0){
 if(!record(v)||depth>12)throw Error('Invalid conflict condition.');
 if('fact'in v){if(Object.keys(v).sort().join()!=='equals,fact'||!questions.has(v.fact)||!['yes','no'].includes(v.equals))throw Error('Unknown conflict fact.');}
 else {const keys=Object.keys(v);if(keys.length!==1||!['all','any'].includes(keys[0])||!list(v[keys[0]])||!v[keys[0]].length)throw Error('Unsupported condition.');for(const c of v[keys[0]])validateCondition(c,questions,depth+1);}
}
export function loadRequirements(value:unknown,citationIds:string[]):Catalog {
 const v=structuredClone(value) as Catalog;
 if(!record(v)||v.schemaVersion!==1||!id(v.id)||!id(v.version)||!list(v.questions)||!list(v.requirements)||!v.requirements.length||!list(v.relationships)||!list(v.constraints))throw Error('Invalid requirement catalog.');
 unique(v.questions,q=>q.id);unique(v.requirements,r=>r.id);unique(v.relationships,r=>r.id);unique(v.constraints,c=>c.id);
 for(const q of v.questions){if(!id(q.id))throw Error('Invalid question identity.');labels(q.label);}
 const questions=new Set(v.questions.map(q=>q.id)),requirements=new Set(v.requirements.map(r=>r.id));
 for(const r of v.requirements){if(!id(r.id)||!id(r.version)||![r.title,r.titleEn,r.statement,r.action,r.actionEn].every(text)||!list(r.terms)||!r.terms.every(text))throw Error('Invalid requirement definition.');validateRule(r.rule,questions);}
 const citationSet=new Set(citationIds);
 for(const r of v.relationships){if(!id(r.id)||!id(r.version)||!requirements.has(r.requirementId)||!citationSet.has(r.citationId)||r.relation!=='interpreted_from'||!record(r.provenance)||!['curated','ai_generated','source_explicit'].includes(r.provenance.origin)||!text(r.provenance.record)||!text(r.provenance.rationale)||!['unverified','reviewed'].includes(r.verification))throw Error('Invalid regulatory relationship or provenance.');}
 for(const r of v.relationships)if(r.verification==='reviewed'&&(!r.review||!record(r.review)||!text(r.review.reviewer)||!text(r.review.note)||!Number.isFinite(Date.parse(r.review.reviewedAt))))throw Error('Reviewed relationship lacks a review record.');
 for(const r of v.requirements)if(!v.relationships.some(link=>link.requirementId===r.id))throw Error('Requirement lacks a regulatory relationship.');
 for(const c of v.constraints){if(!id(c.id)||!text(c.message))throw Error('Invalid constraint.');refs(c.requirements,requirements,true);if(c.type==='conflict')validateCondition(c.when,questions);else if(c.type==='context_matches_scenario'){if(!id(c.field))throw Error('Invalid context field.');}else throw Error('Unsupported constraint.');}
 return v;
}
export function loadUseCases(value:unknown,catalog:Catalog):UseCases {
 const v=structuredClone(value) as UseCases;
 if(!record(v)||v.schemaVersion!==1||!id(v.version)||!list(v.useCases)||!v.useCases.length)throw Error('Invalid use-case configuration.');unique(v.useCases,u=>u.id);
 const requirements=new Set(catalog.requirements.map(r=>r.id)),questions=new Set(catalog.questions.map(q=>q.id)),constraints=new Set(catalog.constraints.map(c=>c.id));
 for(const u of v.useCases){if(!id(u.id)||!id(u.version)||!id(u.defaultScenarioId)||!id(u.reportKind)||!id(u.reportFilename)||!text(u.scope)||!list(u.limitations)||!list(u.contextFields))throw Error('Invalid use case.');labels(u.label);labels(u.heading);labels(u.scopeNote);u.limitations.forEach(labels);refs(u.requirementIds,requirements,true);refs(u.scopeQuestions,questions);refs(u.constraintIds,constraints);unique(u.contextFields,f=>f.id);
  for(const f of u.contextFields){if(!id(f.id)||!list(f.options)||!f.options.length)throw Error('Invalid context options.');labels(f.label);unique(f.options,o=>o.value);for(const option of f.options){if(!id(option.value))throw Error('Invalid context option.');labels(option.label);}}
  for(const c of catalog.constraints.filter(c=>u.constraintIds.includes(c.id)))if(c.type==='context_matches_scenario'&&!u.contextFields.some(f=>f.id===c.field))throw Error('Constraint refers to an unavailable context field.');
  if(u.legacy&&(!id(u.legacy.rules)||!id(u.legacy.reportKind)||!id(u.legacy.contextProperty)||!u.contextFields.some(f=>f.id===u.legacy!.contextField)))throw Error('Invalid compatibility mapping.');
 }
 if(!v.useCases.some(u=>u.id===v.defaultUseCaseId))throw Error('Missing default use case.');return v;
}
export function relationshipEligible(r:Relationship){return r.provenance.origin!=='ai_generated'||r.verification==='reviewed';}
