import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import definitions from '../examples/evidence/retrieval-eval/queries.json';
import rules from '../examples/evidence/retrieval-eval/rules.json';
import { canonicalJson, hashJson, hashSource, prepareRetrievalManifest, validateRetrievalManifest, createRelevanceTemplate,
  validateRelevancePacket, freezeRelevanceReference, validateFrozenReference, scoreRetrieval, runRetrievalEvaluation,
  renderRetrievalReport, renderRetrievalCase, type RelevancePacket, type RelevanceLabel } from '../src/retrieval-evaluation';

// Arithmetic and simulated reviewer metadata below are test inputs, not human ground truth.
// No confirmed reference or measured report for these fabricated test labels is written to project artifacts.
const manifest = prepareRetrievalManifest(definitions, rules, {});
const template = createRelevanceTemplate(manifest);
function testReview(): RelevancePacket {
  const packet = structuredClone(template);
  packet.confirmation = { reviewerAlias: 'TEST ONLY - not an actual human reference', confirmedAt: '2026-11-06T12:00:00Z', independentReview: true };
  for (const entry of packet.cases) for (const row of entry.judgments) { row.label = 'not_relevant'; row.confirmed = true; }
  return packet;
}

test('canonical SHA-256 hashes are stable across object key order and source line endings, and detect input changes', () => {
  assert.equal(hashJson({ z: 2, a: 1 }), hashJson({ a: 1, z: 2 }));
  assert.equal(hashSource('a\r\nb\r\n'), hashSource('a\nb\n'));
  assert.equal(hashJson({ a: 1 }), `sha256:${createHash('sha256').update('{"a":1}').digest('hex')}`);
  assert.notEqual(hashJson([1, 2]), hashJson([2, 1]));
  assert.throws(() => canonicalJson({ invalid: undefined }));
  for (const section of ['corpus', 'relations', 'queries', 'rules', 'software']) assert.match(manifest.hashes[section], /^sha256:[a-f0-9]{64}$/);
  const changed = structuredClone(manifest); changed.payload.documents[0].content += '\n';
  assert.throws(() => validateRetrievalManifest(changed), /hash mismatch/);
});

test('18 frozen query configurations have complete source-pinned eligible pools determined without rankings', () => {
  assert.equal(manifest.payload.cases.length, 18); assert.equal(new Set(manifest.payload.cases.map((entry) => entry.id)).size, 18);
  for (const entry of manifest.payload.cases) {
    const packet = template.cases.find((item) => item.caseId === entry.id)!;
    assert.deepEqual(packet.judgments.map((row) => row.passage.id), entry.eligiblePassageIds);
    for (const row of packet.judgments) {
      assert.equal(row.label, null); assert.equal(row.confirmed, false);
      const document = manifest.payload.documents.find((document) => document.id === row.passage.documentId && document.revision === row.passage.revision)!;
      assert.equal(document.content.slice(row.passage.start, row.passage.end), row.passage.text);
      assert.equal(document.systemId, entry.systemId);
    }
    assert.ok(!('results' in packet) && !('paths' in packet) && !('predictions' in packet));
  }
  assert.equal(template.confirmation.independentReview, false);
  assert.ok(!manifest.payload.cases[0].eligiblePassageIds.some((id) => id.startsWith('dispatch-gates@1:')));
  assert.ok(manifest.payload.cases.find((entry) => entry.id === 'retrieval-009')!.eligiblePassageIds.some((id) => id.startsWith('dispatch-gates@1:')));
  assert.deepEqual(prepareRetrievalManifest(definitions, rules, {}), manifest);
});

test('confirmation rejects incomplete, changed, duplicate, out-of-scope and unconfirmed references', () => {
  assert.throws(() => freezeRelevanceReference(manifest, template), /human/);
  const partial = testReview(); partial.cases[0].judgments[0].confirmed = false;
  assert.throws(() => freezeRelevanceReference(manifest, partial), /Every eligible/);
  const missing = structuredClone(template); missing.cases[0].judgments.pop(); assert.throws(() => validateRelevancePacket(manifest, missing), /entire eligible/);
  const duplicate = structuredClone(template); duplicate.cases[0].judgments[1] = duplicate.cases[0].judgments[0]; assert.throws(() => validateRelevancePacket(manifest, duplicate));
  const altered = structuredClone(template); altered.cases[0].judgments[0].passage.text += ' invented'; assert.throws(() => validateRelevancePacket(manifest, altered), /source/);
  const other = structuredClone(template); other.cases[0].judgments[0] = structuredClone(other.cases[17].judgments[0]); assert.throws(() => validateRelevancePacket(manifest, other), /outside/);
  const query = structuredClone(template); query.cases[0].context.control.statement = 'Different question'; assert.throws(() => validateRelevancePacket(manifest, query), /query\/control/);
  const instruction = structuredClone(template); instruction.instructions.relevance = 'Use the search ranking as truth.'; assert.throws(() => validateRelevancePacket(manifest, instruction), /instructions/);
});

test('Precision@5 uses five slots; recall uses all relevant judgments and distinguishes full-list from top-five misses', () => {
  const passage = template.cases[0].judgments[0].passage;
  const rows: RelevanceLabel[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ passage: { ...passage, id }, label: ['a', 'f'].includes(id) ? 'relevant' : 'not_relevant', confirmed: true, comment: 'Arithmetic example.' }));
  const score = scoreRetrieval(['a', 'b', 'c', 'd', 'e', 'f'], rows, true);
  assert.equal(score.precisionAt5, 0.2); assert.equal(score.precisionDenominator, 5);
  assert.equal(score.recallAt5, 0.5); assert.equal(score.recallDenominator, 2);
  assert.deepEqual(score.missedRelevantAtKIds, ['f']); assert.deepEqual(score.missedRelevantFullIds, []);
  assert.deepEqual(score.irrelevantAtKIds, ['b', 'c', 'd', 'e']);
  assert.equal(scoreRetrieval(['a'], rows, true).precisionAt5, 0.2);
  assert.equal(scoreRetrieval([], rows, true).recallAt5, 0);
  assert.throws(() => scoreRetrieval(['a', 'a'], rows, true));
  assert.throws(() => scoreRetrieval(['unknown'], rows, true));
  assert.equal(scoreRetrieval(['a'], rows, false).precisionAt5, null);
  assert.equal(scoreRetrieval(['a'], [{ ...rows[0], label: 'uncertain' }], true).precisionAt5, null);
});

test('zero-relevant queries use explicit no-answer checks, never invented perfect recall or positive metric samples', () => {
  const row = { ...template.cases[0].judgments[0], label: 'not_relevant' as const, confirmed: true };
  const empty = scoreRetrieval([], [row], true); const returned = scoreRetrieval([row.passage.id], [row], true);
  assert.equal(empty.status, 'zero_relevant'); assert.equal(empty.precisionAt5, null); assert.equal(empty.recallAt5, null); assert.equal(empty.recallDenominator, 0);
  assert.equal(empty.noAnswer.correctEmptyReturn, true); assert.equal(returned.noAnswer.correctEmptyReturn, false);
  assert.deepEqual(returned.irrelevantFullIds, [row.passage.id]);
  assert.equal(scoreRetrieval([], [{ ...row, confirmed: false }], true).noAnswer.correctEmptyReturn, null);
});

test('unreviewed report exposes actual differences and five-hop rank without claiming measured relevance', () => {
  const report = runRetrievalEvaluation(manifest, { labels: template });
  assert.equal(report.referenceStatus, 'awaiting_human_confirmation'); assert.equal(report.aggregate.positiveQueryCount, 0);
  assert.equal(report.judgments.unconfirmed, report.judgments.total);
  assert.ok(report.cases.every((entry) => entry.text.precisionAt5 === null && entry.graph.recallAt5 === null));
  const original = report.cases[0]; assert.equal(original.text.returnedCount, 4); assert.equal(original.graph.returnedCount, 7);
  assert.ok(original.curatedAblation.absentWithoutCuratedIds.includes('dispatch-signoff@1:34-107'));
  assert.equal(report.depthAblation[0].probeRank, null); assert.equal(report.depthAblation[1].probeRank, 7);
  assert.ok(report.depthAblation.every((entry) => entry.probeInTop5 === false));
  assert.ok(report.depthAblation[0].limitsReached.includes('maxDepth'));
  assert.ok(report.cases.find((entry) => entry.id === 'retrieval-011')!.diagnostics.some((entry) => entry.target.includes('unpublished-annex')));
  const source = renderRetrievalCase(report, original);
  assert.match(source, /dispatch-signoff@1:34-107/); assert.match(source, /related_control/); assert.match(source, /Human Oversight/);
  assert.match(renderRetrievalReport(report), /relevance metrics are withheld/);
  assert.deepEqual(runRetrievalEvaluation(manifest, { labels: template }), report);
});

test('hash-verified test attestations gate scoring; uncertainty excludes whole queries and tampering invalidates the reference', () => {
  const packet = testReview(); packet.cases[0].judgments.find((row) => row.passage.id === 'dispatch-signoff@1:34-107')!.label = 'relevant';
  const reference = freezeRelevanceReference(manifest, packet); validateFrozenReference(manifest, reference);
  const report = runRetrievalEvaluation(manifest, { reference });
  assert.deepEqual(report.aggregate.positiveQueryIds, ['retrieval-001']); assert.equal(report.aggregate.zeroRelevantQueryCount, 17);
  assert.equal(report.aggregate.graph.microRecallDenominator, 1); assert.equal(report.aggregate.graph.microPrecisionDenominator, 5);
  assert.equal(report.cases[0].graph.recallAt5, 0); assert.deepEqual(report.cases[0].graph.missedRelevantFullIds, []);
  // A pre-freeze raw packet never enables metrics, even if its fields look confirmed.
  assert.equal(runRetrievalEvaluation(manifest, { labels: packet }).aggregate.positiveQueryCount, 0);
  const uncertain = testReview(); uncertain.cases[0].judgments[0].label = 'uncertain';
  const partial = runRetrievalEvaluation(manifest, { reference: freezeRelevanceReference(manifest, uncertain) });
  assert.deepEqual(partial.aggregate.incompleteQueryIds, ['retrieval-001']); assert.equal(partial.cases[0].graph.recallAt5, null);
  const tampered = structuredClone(reference); tampered.labels.cases[0].judgments[0].comment = 'changed after freeze';
  assert.throws(() => validateFrozenReference(manifest, tampered), /hash mismatch/);
});

test('offline CLI prepares a blank pack, refuses overwrite/fake confirmation, and exports reproducible pending reports', async () => {
  const parent = resolve(tmpdir()); const directory = await mkdtemp(join(parent, 'jev-retrieval-test-'));
  const invoke = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', '--import', './test-support/offline.js', 'scripts/evaluate-retrieval.ts', ...args], { encoding: 'utf8', timeout: 30000 });
  try {
    const pack = join(directory, 'review'); const output = join(directory, 'report');
    const prepared = invoke('prepare', '--out', pack); assert.equal(prepared.status, 0, prepared.stderr);
    const manifestPath = join(pack, 'manifest.json'); const labelsPath = join(pack, 'relevance-labels.json');
    const before = await readFile(labelsPath, 'utf8'); assert.equal(JSON.parse(before).confirmation.independentReview, false);
    assert.notEqual(invoke('prepare', '--out', pack).status, 0); assert.equal(await readFile(labelsPath, 'utf8'), before);
    assert.notEqual(invoke('freeze', '--manifest', manifestPath, '--labels', labelsPath, '--out', join(directory, 'not-a-human-reference.json')).status, 0);
    const run = invoke('run', '--manifest', manifestPath, '--labels', labelsPath, '--out', output); assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(await readFile(join(output, 'results.json'), 'utf8')); const checksums = JSON.parse(await readFile(join(output, 'checksums.json'), 'utf8'));
    assert.equal(result.referenceHash, null); assert.equal(result.aggregate.positiveQueryCount, 0);
    assert.equal(checksums.resultsHash, hashJson(result)); assert.equal(checksums.files['report.md'], hashSource(await readFile(join(output, 'report.md'), 'utf8')));
    assert.equal((await readdir(join(output, 'cases'))).length, 18);
    const second = join(directory, 'repeat'); assert.equal(invoke('run', '--manifest', manifestPath, '--labels', labelsPath, '--out', second).status, 0);
    assert.equal(await readFile(join(second, 'results.json'), 'utf8'), await readFile(join(output, 'results.json'), 'utf8'));
    const fakeImplementation = structuredClone(manifest); await writeFile(join(directory, 'different-code.json'), JSON.stringify(fakeImplementation));
    assert.match(invoke('run', '--manifest', join(directory, 'different-code.json'), '--out', join(directory, 'blocked')).stderr, /implementation hash mismatch/);
  } finally {
    assert.equal(dirname(directory), parent); assert.ok(basename(directory).startsWith('jev-retrieval-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});
