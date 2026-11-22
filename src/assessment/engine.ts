import { ruleFacts, relationshipEligible, type Catalog, type Condition, type Fact, type FactValue, type Outcome, type Rule, type UseCase } from './configuration';
export const ENGINE_VERSION='documentary-engine-1';
type Input={facts:Record<string,Fact>;context:Record<string,string>;expectedContext:Record<string,string>;availableCitationIds:Set<string>;review:(requirementId:string,evidenceId:string)=>string|undefined};
/** Unknown information remains unknown. No product, law, question or requirement IDs live here. */
export function evaluateRequirements(catalog:Catalog,useCase:UseCase,input:Input){
 const known=(id:string):FactValue=>{const f=input.facts[id];return f&&f.value!=='unknown'&&(f.note.trim()||f.evidenceIds.length)?f.value:'unknown';};
 const condition=(c:Condition):boolean|null=>{
  if('fact'in c){const value=known(c.fact);return value==='unknown'?null:value===c.equals;}
  const values=('all'in c?c.all:c.any).map(condition);
  return 'all'in c?values.includes(false)?false:values.includes(null)?null:true:values.includes(true)?true:values.includes(null)?null:false;
 };
 function run(rule:Rule,active:Set<string>):Outcome {
  if(typeof rule==='string')return rule;
  if(rule.op==='require'){rule.facts.forEach(f=>active.add(f));const values=rule.facts.map(known);return values.includes('no')?'gap':values.every(v=>v==='yes')?'satisfied':'unknown';}
  active.add(rule.fact);const value=known(rule.fact);return value==='unknown'?'unknown':run(value==='yes'?rule.yes:rule.no,active);
 }
 return useCase.requirementIds.map(requirementId=>{
  const requirement=catalog.requirements.find(r=>r.id===requirementId)!;const active=new Set<string>();
  const ruleOutcome=run(requirement.rule,active),links=catalog.relationships.filter(r=>r.requirementId===requirementId);
  const citationIds=[...new Set(links.map(r=>r.citationId))];
  const citationErrors=citationIds.filter(id=>!input.availableCitationIds.has(id));
  const relationshipErrors=links.filter(r=>!relationshipEligible(r)).map(r=>r.id);
  const contradictions:string[]=[];
  for(const c of catalog.constraints.filter(c=>useCase.constraintIds.includes(c.id)&&c.requirements.includes(requirementId))){
   if(c.type==='conflict'&&condition(c.when)===true)contradictions.push(c.message);
   if(c.type==='context_matches_scenario'&&input.context[c.field]!==input.expectedContext[c.field])contradictions.push(c.message);
  }
  const activeInputs=[...active],evidenceIds=[...new Set(activeInputs.flatMap(id=>input.facts[id]?.evidenceIds??[]))];
  for(const id of evidenceIds){const review=input.review(requirementId,id);if(review&&review!=='supported')contradictions.push('Human review requires clarification: '+id);}
  return {checkId:requirementId,requirementVersion:requirement.version,ruleOutcome,outcome:(citationErrors.length||relationshipErrors.length||contradictions.length?'unknown':ruleOutcome) as Outcome,activeInputs,missing:activeInputs.filter(id=>known(id)==='unknown'),contradictions,citationErrors,relationshipErrors,evidenceIds,facts:Object.fromEntries(activeInputs.map(id=>[id,input.facts[id]])),citationIds,relationships:links,action:requirement.action,actionEn:requirement.actionEn,ruleInputs:ruleFacts(requirement.rule)};
 });
}
