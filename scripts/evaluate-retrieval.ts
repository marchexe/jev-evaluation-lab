import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { IMPLEMENTATION_FILES, hashSource, hashJson, canonicalJson, prepareRetrievalManifest, validateRetrievalManifest,
  createRelevanceTemplate, validateRelevancePacket, freezeRelevanceReference, runRetrievalEvaluation,
  renderRetrievalReport, renderRetrievalCase, type RetrievalManifest, type RelevancePacket, type FrozenRelevanceReference } from '../src/retrieval-evaluation';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = async (path: string) => JSON.parse(await readFile(resolve(path), 'utf8'));
const formatted = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
async function sources() {
  return Object.fromEntries(await Promise.all(IMPLEMENTATION_FILES.map(async (path) => [path, hashSource(await readFile(resolve(root, path), 'utf8'))])));
}
async function loadManifest(path?: string): Promise<RetrievalManifest> {
  if (!path) throw new Error('--manifest is required.');
  const manifest: RetrievalManifest = await json(path); validateRetrievalManifest(manifest);
  if (Number(process.versions.node.split('.')[0]) !== manifest.payload.software.nodeMajor) throw new Error('Use Node.js 24.x for this frozen experiment.');
  if (canonicalJson(await sources()) !== canonicalJson(manifest.payload.software.files)) throw new Error('Frozen implementation hash mismatch. Restore the recorded implementation; do not silently regenerate a confirmed experiment.');
  return manifest;
}
async function newDirectory(path: string) {
  const destination = resolve(path); await mkdir(dirname(destination), { recursive: true });
  await mkdir(destination); // EEXIST is intentional: never overwrite reviews or experiment artifacts.
  return destination;
}
async function writeJson(path: string, value: unknown) { await writeFile(path, formatted(value), { encoding: 'utf8', flag: 'wx' }); }

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    out: { type: 'string' }, manifest: { type: 'string' }, labels: { type: 'string' }, reference: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log('Offline only; no .env, SDK client, model requests or generated relevance labels.');
    console.log('eval:retrieval -- prepare --out <new-review-directory>');
    console.log('eval:retrieval -- run --manifest <manifest.json> [--labels <draft-labels.json> | --reference <frozen-reference.json>] --out <new-report-directory>');
    console.log('eval:retrieval -- freeze --manifest <manifest.json> --labels <human-reviewed-labels.json> --out <new-reference-file.json>');
    return;
  }
  if (positionals.length !== 1 || !['prepare', 'freeze', 'run'].includes(positionals[0]) || !values.out) throw new Error('Provide prepare, freeze, or run and --out. Use --help for syntax.');
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Use Node.js 24.x.');
  if (values.labels && values.reference) throw new Error('Use --labels or --reference, not both.');
  const command = positionals[0];
  if (command === 'prepare') {
    if (values.manifest || values.labels || values.reference) throw new Error('prepare accepts only --out.');
    const definition = await json(resolve(root, 'examples/evidence/retrieval-eval/queries.json'));
    const rules = await json(resolve(root, 'examples/evidence/retrieval-eval/rules.json'));
    const manifest = prepareRetrievalManifest(definition, rules, await sources());
    const labels = createRelevanceTemplate(manifest); const directory = await newDirectory(values.out);
    await writeJson(resolve(directory, 'manifest.json'), manifest);
    await writeJson(resolve(directory, 'relevance-labels.json'), labels);
    console.log(`Prepared ${manifest.payload.cases.length} cases and ${labels.cases.reduce((sum, entry) => sum + entry.judgments.length, 0)} blank query/passage judgments.`);
    console.log(`Experiment ${manifest.hashes.experiment}. No ground truth or relevance metrics were generated.`);
    return;
  }
  const manifest = await loadManifest(values.manifest);
  if (command === 'freeze') {
    if (!values.labels || values.reference) throw new Error('freeze requires --labels and does not accept --reference.');
    const reference = freezeRelevanceReference(manifest, await json(values.labels));
    const output = resolve(values.out); await mkdir(dirname(output), { recursive: true }); await writeJson(output, reference);
    console.log(`Frozen human reference ${reference.referenceHash}. Uncertain judgments still exclude their queries from relevance metrics.`);
    return;
  }
  const labels: RelevancePacket | undefined = values.labels ? await json(values.labels) : undefined;
  const reference: FrozenRelevanceReference | undefined = values.reference ? await json(values.reference) : undefined;
  if (labels) validateRelevancePacket(manifest, labels);
  const report = runRetrievalEvaluation(manifest, { labels, reference });
  const directory = await newDirectory(values.out); await mkdir(resolve(directory, 'cases'));
  const files: Record<string, string> = { 'manifest.json': formatted(manifest), 'results.json': formatted(report), 'report.md': renderRetrievalReport(report) };
  files[reference ? 'frozen-reference.json' : 'reference-labels.json'] = formatted(reference ?? labels ?? createRelevanceTemplate(manifest));
  for (const entry of report.cases) files[`cases/${entry.id}.md`] = renderRetrievalCase(report, entry);
  for (const [path, text] of Object.entries(files)) await writeFile(resolve(directory, path), text, { encoding: 'utf8', flag: 'wx' });
  await writeJson(resolve(directory, 'checksums.json'), { experimentHash: manifest.hashes.experiment, referenceHash: report.referenceHash,
    resultsHash: hashJson(report), files: Object.fromEntries(Object.entries(files).map(([path, text]) => [path, hashSource(text)])) });
  console.log(`${report.referenceStatus}: ${report.cases.length} cases; ${report.judgments.total} pairs; ${report.judgments.unconfirmed} unconfirmed.`);
  console.log(`Paired metric sample: ${report.aggregate.positiveQueryCount}; zero-reference sample: ${report.aggregate.zeroRelevantQueryCount}.`);
  console.log(`Saved report.md, results.json, frozen inputs, checksums and ${report.cases.length} per-case analyses to ${directory}.`);
}
main().catch((error: unknown) => { console.error(`Retrieval evaluation failed: ${error instanceof Error ? error.message : 'Unknown local error.'}`); process.exitCode = 1; });
