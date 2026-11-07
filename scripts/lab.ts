import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';
import { judgeEvidence } from '../src/server/evidence-assessment';
import { importAssessmentHistory, importEvidenceExperiment, parseImport } from '../src/ui/import-export';
import { validateQuestionConfiguration } from '../src/question-config.js';
import { TypeSafeError } from '@typesafe-ai/sdk';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    case: { type: 'string' }, config: { type: 'string' }, input: { type: 'string' }, kind: { type: 'string' },
    output: { type: 'string' }, live: { type: 'boolean', default: false },
  } });
  if (positionals.length !== 1 || !['validate', 'evidence'].includes(positionals[0])) throw new Error('Usage: lab evidence --case ID [--config FILE] [--live --output NEW_FILE] | lab validate --kind history|evidence|governance-questions|evidence-questions --input FILE');
  if (positionals[0] === 'validate') {
    if (values.live || !values.input) throw new Error('validate is offline and requires --input.');
    const value = parseImport(await readFile(values.input, 'utf8'));
    if (values.kind === 'history') console.log(`Valid history: ${importAssessmentHistory(value).length} assessments.`);
    else if (values.kind === 'evidence') { const parsed = importEvidenceExperiment(value); console.log(`Valid evidence experiment: ${parsed.runs.length} runs, ${parsed.reviews.length} reviews.`); }
    else if (['governance-questions', 'evidence-questions'].includes(values.kind ?? '')) {
      const kind = values.kind!.split('-')[0]; const checked = validateQuestionConfiguration(value, kind); console.log(`Valid ${kind} configuration: ${checked.version}.`);
    } else throw new Error('Unknown validation kind.');
    return;
  }
  if (!values.case) throw new Error('evidence requires --case.');
  const questionConfiguration = values.config ? validateQuestionConfiguration(parseImport(await readFile(values.config, 'utf8')), 'evidence') : undefined;
  if (values.live) {
    if (!values.output) throw new Error('Live evidence requires --output NEW_FILE.');
    try { await stat(values.output); throw new Error('Output exists; choose a new file before paid inference.'); }
    catch (e: any) { if (e.code !== 'ENOENT') throw e; }
    await mkdir(dirname(resolve(values.output)), { recursive: true });
    try { loadEnvFile('.env'); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
  }
  const result = await judgeEvidence(values.case, { live: values.live, questionConfiguration });
  if (values.live) {
    try { await writeFile(values.output!, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
    catch { console.log(JSON.stringify(result, null, 2)); throw new Error('Response could not be saved; complete result is on stdout. No retry.'); }
    console.log(`Saved ${values.output}`);
  } else console.log(JSON.stringify(result, null, 2));
}
main().catch((e) => { console.error(e instanceof TypeSafeError ? 'Jev request failed. Check server credentials/provider access; no retry was attempted.' : e.message); process.exitCode = 1; });
