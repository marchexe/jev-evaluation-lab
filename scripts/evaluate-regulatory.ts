import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import cases from '../examples/regulatory/evaluation.json';
import { freshDraft, regulatoryReport, regulatoryMarkdown, regulatoryCorpus, regulatoryCatalog, regulatoryUseCases, RULE_VERSION } from '../src/ui/regulatory';

const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--out'||!args[1])throw Error('Usage: npm run eval:regulatory -- --out results/claude-regulatory-eval-new');
const out=args[1];
const files=['examples/regulatory/corpus.json','examples/regulatory/scenarios.json','examples/regulatory/questions.json','examples/regulatory/evaluation.json','src/ui/regulatory.ts','src/assessment/configuration.ts','src/assessment/engine.ts','src/regulatory/knowledge.ts','examples/regulatory/requirements.json','examples/regulatory/use-cases.json','src/ui/evidence.ts','src/ui/evidence-graph.ts','src/ui/evidence-runs.ts','src/ui/graph-ranking.ts','src/question-config.js','package-lock.json','scripts/evaluate-regulatory.ts'];
const hashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update((await readFile(f,'utf8')).replace(/\r\n?/g,'\n')).digest('hex')])));
const results=cases.cases.map(c=>{const draft=freshDraft(c.scenarioId),report=regulatoryReport(draft);const actual=Object.fromEntries(report.findings.map(f=>[f.checkId,f.outcome]));if(JSON.stringify(actual)!==JSON.stringify(c.expected))throw Error('Rule regression: '+c.id);return {id:c.id,draft,report};});
await mkdir(out,{recursive:false});
for(const r of results){await writeFile(join(out,r.id+'.json'),JSON.stringify(r.report,null,2)+'\n',{flag:'wx'});await writeFile(join(out,r.id+'.md'),regulatoryMarkdown(r.draft),{flag:'wx'});}
await writeFile(join(out,'manifest.json'),JSON.stringify({schemaVersion:1,id:cases.id,rules:RULE_VERSION,corpusFingerprint:regulatoryCorpus.fingerprint,catalog:{id:regulatoryCatalog.id,version:regulatoryCatalog.version},useCases:regulatoryUseCases,engineVersion:results[0].report.engineVersion,node:process.versions.node,referenceType:cases.referenceType,humanConfirmed:false,inferenceCalls:0,files:hashes,cases:results.map(r=>r.id)},null,2)+'\n',{flag:'wx'});
console.log(`Passed ${results.length} synthetic scenarios / ${results.reduce((n,r)=>n+r.report.findings.length,0)} rule outcomes. No inference. Saved reports and manifest to ${out}.`);
