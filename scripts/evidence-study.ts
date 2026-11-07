import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { hashJson, hashSource, validateRetrievalManifest } from '../src/retrieval-evaluation';
import { evidenceQuestionConfig } from '../src/evidence-question-config.js';
import { configuredQuestions } from '../src/server/question-builders.js';
import { runSystemOne } from '../src/system-one.js';
import { segmentDocument } from '../src/ui/evidence';
import { validateAssessment } from '../src/ui/import-export';

const read = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const save = (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const alternative = structuredClone(evidenceQuestionConfig);
alternative.evidence_judgment.instructions = 'What does this exact passage establish about `control.statement`? Evaluate the system actions specified in that statement. Do not assume missing workflow steps, infer execution from leaving a queue, or judge legal compliance.';
alternative.evidence_judgment.criteria.supported = 'The text establishes that a human approves every relevant recommendation before execution. Approval of training data, a manual, or another process is not approval of system recommendations.';
alternative.evidence_judgment.criteria.contradicted = 'The text explicitly permits at least some relevant recommendations to execute without prior human approval. After-the-fact review alone does not meet prior approval.';
alternative.evidence_judgment.criteria.insufficient_evidence = 'The text supplies no information about approval or control of the relevant deployed actions. Data formats, editorial checks, and training-data review alone are insufficient.';
alternative.evidence_judgment.criteria.ambiguous = 'The relevant arrangement is mentioned but vague, has unresolved workflow timing or scope, or includes incompatible claims about the same deployment.';
alternative.addresses_control.instructions = 'Does this exact passage help establish, dispute, or locate documentation of `control.statement` for this system?';
alternative.addresses_control.criteria.true = 'It states an approval arrangement or its absence, gives a vague or conflicting human-control claim, or provides a relevant scope note, revision note, control alias, or source reference. A broken link is only a lead, not evidence of its missing contents.';
alternative.addresses_control.criteria.false = 'It only shares topic words, describes data or outputs without control information, or concerns review of another target such as spelling, manuals, or training labels.';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    out: { type: 'string' }, manifest: { type: 'string' }, live: { type: 'boolean', default: false },
  } });
  const command = positionals[0] ?? 'preview';
  if (command === 'prepare') {
    if (!values.out) throw new Error('prepare requires --out pointing to a new protocol JSON file.');
    const frozen = await read('examples/evidence/retrieval-eval/frozen-inputs/manifest.json'); validateRetrievalManifest(frozen);
    const holdout = await read('examples/evidence/jev-study/heldout.json');
    const direct: Record<string, string | null> = {
      'dispatch-policy@1:47-186': 'supported', 'dispatch-runbook@1:34-169': 'contradicted',
      'dispatch-signoff@1:34-107': 'ambiguous', 'tutor-overview@1:34-108': 'ambiguous',
      'dispatch-gates@1:40-157': 'supported', 'dispatch-gates@2:224-348': 'contradicted',
      'dispatch-gates@2:46-208': null,
    };
    const relevant = new Set(['dispatch-policy@1:47-186', 'dispatch-runbook@1:34-169', 'dispatch-signoff@1:34-107',
      'tutor-overview@1:34-108', 'dispatch-gates@1:40-157', 'dispatch-gates@2:224-348', 'dispatch-gates@2:46-208',
      'dispatch-gates@2:370-688', 'dispatch-gates@2:709-820', 'dispatch-runbook@1:181-255', 'dispatch-signoff@1:119-198']);
    const dev = frozen.payload.passages.map((passage: any) => ({ id: passage.id, split: 'development', passage,
      expected: Object.hasOwn(direct, passage.id) ? direct[passage.id] : 'insufficient_evidence', relevant: relevant.has(passage.id) }));
    const held = holdout.cases.map((entry: any) => {
      const document = { id: entry.id, revision: '1', systemId: entry.systemId, title: 'Synthetic held-out document', content: `# Synthetic document\n\n## Operation\n\n${entry.text}` };
      return { id: entry.id, split: 'heldout', passage: segmentDocument(document)[0], document, expected: entry.expected, relevant: entry.relevant };
    });
    const configurations = [
      { schemaVersion: 1, kind: 'evidence', version: 'oversight-evidence-1', questions: evidenceQuestionConfig },
      { schemaVersion: 1, kind: 'evidence', version: 'oversight-evidence-2-research', questions: alternative },
    ];
    const payload = { id: 'oversight-jev-study-1', model: 'jev-1.14.0', synthetic: true,
      labelStatus: 'AI-authored design expectations, NOT independent human ground truth; no labels sent to Jev.',
      frozenRetrievalExperiment: frozen.hashes.experiment, configurations, control: frozen.payload.controls[0],
      design: 'One request per case per fixed configuration; no retries. Equal state, pinned model, predeclared 17 development / 12 held-out cases. No tuning after held-out predictions. Noul v1 addresses-control and v2 source-finding relevance have different semantics; they are not calibrated equivalents.',
      prices: { source: 'https://docs.typesafe.ai/models', checkedAt: '2026-11-07', usdPerMillionInputTokens: 0.042, usdPerMillionOutputTokens: 0, estimateOnly: true },
      sourceHashes: { runner: hashSource(await readFile('scripts/evidence-study.ts', 'utf8')), holdout: hashJson(holdout) },
      cases: [...dev, ...held] };
    await save(values.out, { schemaVersion: 1, hash: hashJson(payload), payload });
    console.log('Prepared protocol: 29 cases × 2 configurations = 58 explicit requests. No inference.'); return;
  }
  const protocol = await read(values.manifest ?? 'examples/evidence/jev-study/protocol.json');
  if (protocol.schemaVersion !== 1 || hashJson(protocol.payload) !== protocol.hash) throw new Error('Protocol hash mismatch.');
  const payload = protocol.payload;
  if (command === 'preview' || (command === 'run' && !values.live)) {
    console.log(JSON.stringify({ experiment: payload.id, protocolHash: protocol.hash, cases: payload.cases.length,
      requests: payload.cases.length * payload.configurations.length, mode: 'preview', note: 'run --live --out NEW_DIRECTORY is required for paid inference.' }, null, 2)); return;
  }
  if (!values.out) throw new Error('Provide --out for a new run directory (run) or an existing run directory (report).');
  const directory = resolve(values.out);
  if (command === 'run') {
    try { loadEnvFile('.env'); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
    if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error('Missing server TYPESAFE_API_KEY.');
    await mkdir(directory); // Reject an existing directory before making any paid call.
    await save(join(directory, 'protocol.json'), protocol);
    let attempts = 0;
    for (const [index, item] of payload.cases.entries()) for (const [variant, config] of payload.configurations.entries()) {
      const request = { model: payload.model, state: { control: { id: payload.control.id, statement: payload.control.statement }, passage: item.passage }, questions: configuredQuestions(config, 'evidence') };
      attempts++;
      const record = { schemaVersion: 1, protocolHash: protocol.hash, caseId: item.id, split: item.split, configuration: config, requestHash: hashJson(request) };
      let assessment;
      try {
        assessment = await runSystemOne(request, { profile: 'evidence-study' });
        await save(join(directory, `${String(index + 1).padStart(2, '0')}-${variant + 1}.json`), { ...record, assessment });
        console.log(`${attempts}/${payload.cases.length * payload.configurations.length}: ${item.id} / ${config.version} / ${assessment.response.model}`);
      } catch (e: any) {
        // A local write failure must not discard an already paid-for response.
        if (assessment) console.log(JSON.stringify({ ...record, assessment }, null, 2));
        await save(join(directory, 'failure.json'), { ...record, request, attempts, error: 'Request or persistence failed; no retry attempted.', status: e.status ?? null, requestId: e.requestId ?? null });
        throw new Error('Experiment stopped. Inspect preserved responses/failure.json; no retry was attempted.');
      }
    }
    return;
  }
  if (command !== 'report') throw new Error('Use prepare, preview, run or report.');
  const storedProtocol = await read(join(directory, 'protocol.json'));
  if (hashJson(storedProtocol) !== hashJson(protocol)) throw new Error('Run belongs to another protocol.');
  const files = (await readdir(directory)).filter((file) => /^\d+-\d\.json$/.test(file)).sort();
  const records: any[] = []; const keys = new Set();
  for (const file of files) {
    const record = await read(join(directory, file)); const item = payload.cases.find((c: any) => c.id === record.caseId);
    const config = payload.configurations.find((c: any) => hashJson(c) === hashJson(record.configuration));
    const request = item && config && { model: payload.model, state: { control: { id: payload.control.id, statement: payload.control.statement }, passage: item.passage }, questions: configuredQuestions(config, 'evidence') };
    const key = `${record.caseId}/${record.configuration.version}`;
    if (!request || record.protocolHash !== protocol.hash || record.requestHash !== hashJson(request)
      || hashJson(record.assessment?.request) !== hashJson(request) || record.split !== item.split || keys.has(key)) throw new Error('Changed, duplicate or foreign response.');
    validateAssessment(record.assessment);
    keys.add(key); records.push(record);
  }
  const groups: any[] = [];
  for (const split of ['development', 'heldout']) for (const config of payload.configurations) {
    const selected = records.filter((r) => r.split === split && r.configuration.version === config.version);
    const rows = selected.map((r) => {
      const item = payload.cases.find((c: any) => c.id === r.caseId);
      return { caseId: r.caseId, passage: item.passage, expected: item.expected, expectedRelevance: item.relevant,
        predicted: r.assessment.response.answers.evidence_judgment.choice, noul: r.assessment.response.answers.addresses_control.noul,
        actualModel: r.assessment.response.model, requestId: r.assessment.requestId };
    });
    const labeled = rows.filter((r) => r.expected !== null), errors = labeled.filter((r) => r.expected !== r.predicted);
    groups.push({ split, version: config.version, n: labeled.length, agreements: labeled.length - errors.length,
      excludedUncertain: rows.length - labeled.length, errors,
      falseSupport: errors.filter((r) => r.predicted === 'supported').length,
      missedContradictions: errors.filter((r) => r.expected === 'contradicted').length,
      relevanceThreshold: 0.5, relevanceN: rows.length,
      relevanceErrors: rows.filter((r) => (r.noul >= 0.5) !== r.expectedRelevance), rows });
  }
  const tokens = (key: string) => records.reduce((n, r) => n + (r.assessment.response.usage[key] ?? 0), 0);
  const result = { schemaVersion: 1, status: payload.labelStatus, protocolHash: protocol.hash, expectedRequests: payload.cases.length * payload.configurations.length,
    completedRequests: records.length, complete: records.length === payload.cases.length * payload.configurations.length,
    actualModels: [...new Set(records.map((r) => r.assessment.response.model))],
    usage: { inputTokens: tokens('input_tokens'), outputTokens: tokens('output_tokens'),
      estimatedUsd: tokens('input_tokens') * payload.prices.usdPerMillionInputTokens / 1e6, pricing: payload.prices },
    meanLatencyMs: records.length ? records.reduce((n, r) => n + r.assessment.latencyMs, 0) / records.length : null, groups };
  await save(join(directory, 'analysis.json'), result); console.log(JSON.stringify(result, null, 2));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
