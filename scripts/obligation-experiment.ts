import {readFile,writeFile,mkdir,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {freezeProtocol,makeRequest,validateProtocol,hash,type Protocol} from '../src/experiments/obligation-discovery';
import {evaluateExperiment,markdownReport} from '../src/experiments/obligation-report';
import {runSystemOne} from '../src/system-one.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'examples/regulatory/obligation-experiment');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const save=async(p:string,data:unknown)=>writeFile(p,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const [command,...args]=process.argv.slice(2);
const option=(name:string)=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const protocolPath=path.join(dir,'protocol.json');
async function main(){
 if(command==='prepare'){
  const dataset=await read(path.join(dir,'dataset.json')),questions=await read(path.join(dir,'questions.json')),catalog=await read(path.join(root,'examples/regulatory/requirements.json'));
  const expectations=await read(path.join(dir,'design-expectations.json'));
  const files=['src/experiments/obligation-discovery.ts','src/experiments/obligation-report.ts','scripts/obligation-experiment.ts','src/system-one.js','src/ui/evidence.ts','src/ui/evidence-graph.ts','src/ui/graph-ranking.ts','src/question-config.js','src/ui/reviews.ts','examples/regulatory/corpus.json','examples/regulatory/obligation-experiment/human-review-template.json','package-lock.json'];
  const hashes:Record<string,string>={designExpectations:hash(expectations)};
  for(const name of files)hashes[name]=createHash('sha256').update(await readFile(path.join(root,name))).digest('hex');
  const protocol=freezeProtocol(dataset,questions,catalog,hashes);await save(protocolPath,protocol);console.log('Frozen protocol '+protocol.hash);return;
 }
 const protocol:Protocol=validateProtocol(await read(protocolPath));
 if(command==='preview'){console.log(JSON.stringify({protocolHash:protocol.hash,calls:protocol.payload.dataset.livePlan.map(p=>({unitId:p.unitId,useCaseId:p.useCaseId,request:makeRequest(protocol,p.unitId,p.useCaseId)}))},null,2));return;}
 if(command==='run'){
  if(!args.includes('--live'))throw Error('Inference requires explicit --live. Preview/report are offline.');
  const out=option('--out');if(!out)throw Error('Provide a NEW --out directory; existing runs are never resumed.');
  // Refuse changed code or data before incurring any cost.
  for(const [name,expected]of Object.entries(protocol.payload.sourceHashes))if(name!=='designExpectations'&&createHash('sha256').update(await readFile(path.join(root,name))).digest('hex')!==expected)throw Error('Changed frozen implementation: '+name);
  if(hash(await read(path.join(dir,'dataset.json')))!==hash(protocol.payload.dataset)||hash(await read(path.join(dir,'questions.json')))!==hash(protocol.payload.questionConfiguration))throw Error('Changed frozen inputs.');
  try{await access(path.join(root,'.env'));process.loadEnvFile(path.join(root,'.env'));}catch(error:any){if(error.code!=='ENOENT')throw error;}
  if(!process.env.TYPESAFE_API_KEY?.trim())throw Error('TYPESAFE_API_KEY is required.');
  const output=path.resolve(root,out);await mkdir(output);await save(path.join(output,'protocol.json'),protocol);
  for(const [index,pair]of protocol.payload.dataset.livePlan.entries()){
   if(index>=8)throw Error('Call budget exhausted.');
   // Exclusive journal BEFORE the request: failed attempts consume the budget.
   await save(path.join(output,`attempt-${index+1}.json`),{...pair,attempt:index+1,startedAt:new Date().toISOString(),retries:0,protocolHash:protocol.hash});
   console.log(`Request ${index+1}/${protocol.payload.dataset.livePlan.length}: ${pair.unitId}`);
   try{const assessment=await runSystemOne(makeRequest(protocol,pair.unitId,pair.useCaseId),{profile:'regulatory-obligation-experiment'});
    await save(path.join(output,`record-${index+1}.json`),{schemaVersion:1,protocolHash:protocol.hash,...pair,assessment});
    console.log('Recorded '+assessment.requestId);
   }catch(error:any){await save(path.join(output,`failure-${index+1}.json`),{...pair,status:Number.isInteger(error.status)?error.status:null,latencyMs:error.latencyMs??null,error:'Request or recording failed; stopped without retry.'});throw Error('Experiment stopped; no retries. Inspect saved attempts.');}
  }
  console.log('Complete. Run report separately; no more API calls.');return;
 }
 if(command==='report'){
  const input=option('--run'),out=option('--out');if(!out)throw Error('Provide NEW --out directory.');
  let records:any[]=[];
  if(input){const run=path.resolve(root,input),runProtocol=validateProtocol(await read(path.join(run,'protocol.json')));if(runProtocol.hash!==protocol.hash)throw Error('Different run protocol.');records=await Promise.all((await readdir(run)).filter(n=>/^record-\d+\.json$/.test(n)).sort().map(n=>read(path.join(run,n))));}
  const expectations=await read(path.join(dir,'design-expectations.json')),reviewsPath=option('--field-reviews'),reviews=reviewsPath?await read(path.resolve(root,reviewsPath)):undefined,results=evaluateExperiment(protocol,records,expectations,reviews),output=path.resolve(root,out);await mkdir(output);await save(path.join(output,'results.json'),results);await writeFile(path.join(output,'report.md'),markdownReport(results),{flag:'wx'});await save(path.join(output,'case-analysis.json'),results.caseAnalysis);await save(path.join(output,'manifest.json'),{protocolHash:protocol.hash,resultsHash:hash(results),recordHashes:records.map(r=>({id:r.useCaseId+'::'+r.unitId,hash:hash(r)})),fieldReviewsHash:reviews?hash(reviews):null,sourceHashes:protocol.payload.sourceHashes,independentHumanGroundTruth:!!reviews});console.log(JSON.stringify({output,objective:results.objectiveChecks,exploratory:results.exploratoryReferenceAgreement},null,2));return;
 }
 throw Error('Use prepare | preview | run --live --out NEW_DIRECTORY | report [--run RUN_DIRECTORY] --out NEW_DIRECTORY');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
