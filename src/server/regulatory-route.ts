import { createInferenceHandler } from './assessment-route.js';
import { runSystemOne } from '../system-one.js';
import { configuredQuestions } from './question-builders.js';
import { buildRegulatoryRequest, regulatoryQuestions, regulatoryCorpus } from '../ui/regulatory';

type Selection={scenarioId:string;checkId:string;evidenceId:string;live:true};
export async function judgeRegulatory(input:Selection,signal?:AbortSignal) {
 const request=buildRegulatoryRequest(input.scenarioId,input.checkId,input.evidenceId,process.env.TYPESAFE_DEFAULT_MODEL?.trim()||'jev-latest');
 const assessment=await runSystemOne({...request,questions:configuredQuestions(regulatoryQuestions,'evidence')},{profile:'regulatory-evidence',signal});
 return {checkId:input.checkId,evidenceId:input.evidenceId,corpusFingerprint:regulatoryCorpus.fingerprint,questionVersion:regulatoryQuestions.version,assessment};
}
export function createRegulatoryHandler(judge=judgeRegulatory) {
 return createInferenceHandler((input:Selection)=>{
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join()!=='checkId,evidenceId,live,scenarioId'||input.live!==true||![input.scenarioId,input.checkId,input.evidenceId].every(v=>typeof v==='string'))return {error:'Provide scenarioId, checkId, evidenceId and live: true.'};
  try{buildRegulatoryRequest(input.scenarioId,input.checkId,input.evidenceId);}catch{return {error:'Unknown regulatory control or synthetic evidence.'};}
 },(input:Selection,signal:AbortSignal)=>judge(input,signal));
}
