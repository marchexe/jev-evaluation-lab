import { readFile } from 'node:fs/promises';
import { hashJson, validateRetrievalManifest, runRetrievalEvaluation, canonicalJson, IMPLEMENTATION_FILES, hashSource } from '../src/retrieval-evaluation';

// No .env, SDK clients, confirmation mutation or human-reference freeze operation.
const read = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const manifest = await read('examples/evidence/retrieval-eval/frozen-inputs/manifest.json');
validateRetrievalManifest(manifest);
for (const file of IMPLEMENTATION_FILES) if (hashSource(await readFile(file, 'utf8')) !== manifest.payload.software.files[file]) throw new Error(`Frozen source differs: ${file}`);
const blank = await read('examples/evidence/retrieval-eval/frozen-inputs/relevance-labels.json');
if (blank.cases.some((c: any) => c.judgments.some((j: any) => j.label !== null || j.confirmed))) throw new Error('Original blank packet changed.');
const draft = await read('examples/evidence/retrieval-eval/exploratory-ai-judgments.json');
if (draft.experimentHash !== manifest.hashes.experiment || draft.independentReview !== false || draft.confirmed !== false || draft.judgments.length !== 159) throw new Error('Expected unconfirmed exploratory labels.');
const results = runRetrievalEvaluation(manifest, { labels: blank });
const scenarios = ['broad', 'strict'].map((scenario) => {
  const rows = results.cases.map((c) => {
    const labels = draft.judgments.filter((j: any) => j.caseId === c.id);
    if (canonicalJson(labels.map((j: any) => j.passageId).sort()) !== canonicalJson([...c.eligiblePassageIds].sort())
      || labels.some((j: any) => !['relevant', 'not_relevant'].includes(j[scenario]))) throw new Error('AI label pool differs from frozen pool.');
    const relevant = new Set(labels.filter((j: any) => j[scenario] === 'relevant').map((j: any) => j.passageId));
    const score = (ids: string[]) => { const hits = ids.slice(0, 5).filter((id) => relevant.has(id)).length;
      return { p5: relevant.size ? hits / 5 : null, r5: relevant.size ? hits / relevant.size : null, empty: ids.length === 0 }; };
    return { caseId: c.id, relevant: relevant.size, text: score(c.textResults.map((r) => r.passageId)),
      graph: score(c.graphResults.map((r) => r.passageId)), withoutCurated: score(c.curatedAblation.resultIds) };
  });
  const positive = rows.filter((r) => r.relevant), zero = rows.filter((r) => !r.relevant);
  return { scenario, positiveN: positive.length, zeroN: zero.length,
    strategies: Object.fromEntries((['text', 'graph', 'withoutCurated'] as const).map((s) => [s, {
      macroP5: positive.reduce((n, r) => n + r[s].p5!, 0) / positive.length,
      macroR5: positive.reduce((n, r) => n + r[s].r5!, 0) / positive.length,
      correctEmpty: zero.filter((r) => r[s].empty).length,
    }])), cases: rows };
});
console.log(JSON.stringify({ status: draft.status, experimentHash: manifest.hashes.experiment, compactLabelsHash: hashJson(draft),
  officialUnconfirmedPairs: 159, scenarios }, null, 2));
