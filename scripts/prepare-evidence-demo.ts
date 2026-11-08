import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { resolveEvidenceTarget, validateEvidenceResult, exportEvidenceExperiment, type EvidenceRun } from '../src/ui/evidence-runs';
import { importEvidenceExperiment } from '../src/ui/import-export';

// No SDK client, environment loading, network request, or human reference labels.
const { values } = parseArgs({ options: { output: { type: 'string' } } });
if (!values.output) throw new Error('Use --output NEW_FILE.json. This command is offline.');
const runs: EvidenceRun[] = [];
for (const file of ['01-1.json', '03-1.json', '11-1.json', '15-1.json']) {
  const source = JSON.parse(await readFile(new URL(`../examples/evidence/jev-study/recorded/${file}`, import.meta.url), 'utf8'));
  const { passage, control } = source.assessment.request.state;
  const item = resolveEvidenceTarget({ passageId: passage.id, controlId: control.id });
  const result = { schemaVersion: 1 as const, experimentId: item.experimentId, caseId: item.id, datasetVersion: item.datasetVersion,
    controlId: item.controlId, passage: item.passage, questionVersion: source.configuration.version, questionConfiguration: source.configuration,
    assessment: { ...source.assessment, profile: 'evidence' },
    recordingSource: { file: `examples/evidence/jev-study/recorded/${file}`,
      normalization: 'New Explorer envelope; application profile evidence-study -> evidence. Original SDK request, response and inference metadata unchanged.' } };
  validateEvidenceResult(result);
  runs.push({ id: `offline-demo-${file}`, result, humanReviewAtRequest: null });
}
const packet = exportEvidenceExperiment(runs, []);
importEvidenceExperiment(JSON.parse(packet));
const output = resolve(values.output);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, packet + '\n', { flag: 'wx', mode: 0o600 });
console.log(`Saved ${runs.length} recorded runs to ${output}. No inference and no human labels. Existing files are never replaced.`);
