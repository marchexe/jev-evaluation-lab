import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {captureAssessment,discoverRequirements,replayAssessment} from '../src/regulatory/research';
import {createRegulatoryAssessment,freshDraft} from '../src/ui/regulatory';

const args=process.argv.slice(2);
if(!((args.length===3&&args[0]==='--demo'&&args[1]==='--out')||(args.length===4&&args[0]==='--input'&&args[2]==='--out')))throw Error('Use --demo --out NEW_DIRECTORY or --input SNAPSHOT.json --out NEW_DIRECTORY. Offline only.');
const out=args.at(-1)!;
let snapshot;
if(args[0]==='--demo'){
 const at='2026-11-17T12:00:00Z';
 const batch=await discoverRequirements({scenarioId:'claude-pilot',description:'SYNTHETIC: New internal assistant with employee accounts and logs. Provider roles and transfers are unknown.',terms:['Auftragsverarbeiter','Risiko'],modelRuns:[]},undefined,at);
 snapshot=await captureAssessment(freshDraft('claude-pilot'),{batches:[batch],reviews:[]},undefined,at);
}else{
 const raw=await readFile(args[1]);if(raw.byteLength>2_000_000)throw Error('Snapshot exceeds 2 MB.');snapshot=await replayAssessment(JSON.parse(raw.toString('utf8')));
}
await replayAssessment(snapshot);
await mkdir(out,{recursive:false});
const a=createRegulatoryAssessment(snapshot.payload.resources);
await writeFile(join(out,'snapshot.json'),JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
await writeFile(join(out,'report.md'),a.regulatoryMarkdown(snapshot.payload.report.draft),{flag:'wx'});
await writeFile(join(out,'replay.json'),JSON.stringify({schemaVersion:1,snapshotId:snapshot.id,engineVersion:snapshot.payload.engineVersion,corpusFingerprint:snapshot.payload.report.corpusFingerprint,requirements:snapshot.payload.report.findings.length,proposalBatches:snapshot.payload.research.batches.length,reviewEvents:snapshot.payload.research.reviews.length,inferenceCalls:0,legalValidation:false},null,2)+'\n',{flag:'wx'});
console.log(`Verified ${snapshot.id}. Saved pinned snapshot/report/replay metadata to ${out}. No inference.`);
