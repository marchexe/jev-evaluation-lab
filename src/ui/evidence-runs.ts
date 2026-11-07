import manifest from '../../examples/evidence/experiment.json';
import { DATASET_VERSION, evidencePassages, evidenceControls, evidenceDocuments, exportEvidence, saveEvidenceReview,
  type EvidenceReview, type Passage } from './evidence';
import type { Assessment } from './types';
import type { EvidenceSearchSnapshot } from './evidence-graph';
import { defaultConfigurations, validateQuestionConfiguration, configurationIdentity } from '../question-config.js';

export const EVIDENCE_RUNS_KEY = 'jev.evidence-runs.v1';
export const MAX_EVIDENCE_RUNS = 100;
export const judgmentCategories = ['supported', 'contradicted', 'insufficient_evidence', 'ambiguous'] as const;
export type JudgmentCategory = typeof judgmentCategories[number];
export const experiment = manifest;
export function resolveEvidenceCase(caseId: string) {
  const entry = manifest.cases.find((value) => value.id === caseId);
  const passages = entry ? evidencePassages.filter((value) => value.documentId === entry.documentId && value.revision === entry.revision && value.section === entry.section) : [];
  const control = entry && evidenceControls.find((value) => value.id === entry.controlId);
  if (!entry || passages.length !== 1 || !control) throw new Error('Unknown or changed experiment case.');
  return { ...entry, passage: passages[0], control };
}
export function buildEvidenceRequest(caseId: string, model = 'jev-latest', configuration: unknown = defaultConfigurations.evidence) {
  const { passage, control } = resolveEvidenceCase(caseId);
  if (typeof model !== 'string' || !model.trim()) throw new Error('Invalid model.');
  const selected = validateQuestionConfiguration(configuration, 'evidence');
  return { model: model.trim(), state: { control: { id: control.id, statement: control.statement }, passage }, questions: selected.questions };
}
export type EvidenceResult = {
  schemaVersion: 1; experimentId: string; caseId: string; datasetVersion: string; questionVersion: string;
  controlId: string; passage: Passage;
  questionConfiguration?: ReturnType<typeof validateQuestionConfiguration>;
  assessment: Pick<Assessment, 'startedAt' | 'sdkVersion' | 'requestId' | 'latencyMs' | 'response'> & {
    schemaVersion: number; profile: string; mode: string; request: ReturnType<typeof buildEvidenceRequest>;
  };
};
export type EvidenceRun = { id: string; result: EvidenceResult; humanReviewAtRequest: EvidenceReview | null };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function validateEvidenceResult(value: unknown): asserts value is EvidenceResult {
  const result = value as EvidenceResult;
  const item = resolveEvidenceCase(result?.caseId);
  const assessment = result?.assessment;
  const answer = assessment?.response?.answers?.evidence_judgment;
  const coverage = assessment?.response?.answers?.addresses_control;
  const configuration = validateQuestionConfiguration(result.questionConfiguration ?? defaultConfigurations.evidence, 'evidence');
  if (result.schemaVersion !== 1 || result.experimentId !== manifest.id || result.datasetVersion !== DATASET_VERSION
    || result.questionVersion !== configuration.version || result.controlId !== item.controlId || !equal(result.passage, item.passage)
    || assessment?.schemaVersion !== 1 || assessment.profile !== 'evidence' || assessment.mode !== 'live' || configurationIdentity(assessment.request) !== configurationIdentity(buildEvidenceRequest(result.caseId, assessment.request?.model, configuration))
    || typeof assessment.response?.model !== 'string' || !assessment.response.model || typeof assessment.sdkVersion !== 'string'
    || !Number.isFinite(Date.parse(assessment.startedAt)) || !Number.isFinite(assessment.latencyMs) || assessment.latencyMs < 0
    || !(assessment.requestId === null || typeof assessment.requestId === 'string')
    || answer?.type !== 'choice' || !judgmentCategories.includes(answer.choice as JudgmentCategory)
    || !judgmentCategories.every((label) => Number.isFinite(answer.probabilities?.[label]) && answer.probabilities[label] >= 0 && answer.probabilities[label] <= 1)
    || coverage?.type !== 'noul' || !Number.isFinite(coverage.noul) || coverage.noul < 0 || coverage.noul > 1
    || !assessment.response.usage || !Object.values(assessment.response.usage).every((count) => count === null || (Number.isInteger(count) && count >= 0))) {
    throw new Error('Invalid or incompatible evidence result.');
  }
}
export function readEvidenceRuns(storage: Pick<Storage, 'getItem'>): EvidenceRun[] {
  const raw = storage.getItem(EVIDENCE_RUNS_KEY); if (!raw) return [];
  const saved = JSON.parse(raw);
  if (saved?.schemaVersion !== 1 || !Array.isArray(saved.runs) || saved.runs.length > MAX_EVIDENCE_RUNS) throw new Error('Invalid evidence runs.');
  const ids = new Set();
  for (const run of saved.runs) {
    if (typeof run?.id !== 'string' || !run.id.trim() || ids.has(run.id)) throw new Error('Invalid evidence run ID.');
    ids.add(run.id); validateEvidenceResult(run.result);
    if (run.humanReviewAtRequest !== null) {
      if (!run.humanReviewAtRequest || typeof run.humanReviewAtRequest !== 'object') throw new Error('Invalid reviewer snapshot.');
      saveEvidenceReview([], run.humanReviewAtRequest, run.result.controlId, run.result.passage);
    }
  }
  return saved.runs;
}
export function writeEvidenceRuns(storage: Pick<Storage, 'setItem'>, runs: EvidenceRun[]) {
  if (runs.length > MAX_EVIDENCE_RUNS) throw new Error('Evidence run storage is full.');
  storage.setItem(EVIDENCE_RUNS_KEY, JSON.stringify({ schemaVersion: 1, runs }));
}
export type ComparisonRow = { runId: string; caseId: string; passage: Passage; expected: JudgmentCategory | 'uncertain' | null; predicted: JudgmentCategory };
/** Pure categorical arithmetic. Test rows are arithmetic examples, not invented Jev responses. */
export function scoreEvidenceRows(rows: ComparisonRow[]) {
  const matrix = Object.fromEntries(judgmentCategories.map((expected) => [expected, Object.fromEntries(judgmentCategories.map((predicted) => [predicted, 0]))]));
  const eligible = rows.filter((row) => row.expected !== null && row.expected !== 'uncertain');
  const errors = eligible.filter((row) => row.expected !== row.predicted);
  for (const row of eligible) matrix[row.expected!][row.predicted]++;
  return { n: eligible.length, agreements: eligible.length - errors.length, disagreements: errors.length,
    agreementRate: eligible.length ? (eligible.length - errors.length) / eligible.length : null,
    excludedUnlabeled: rows.filter((row) => row.expected === null).length,
    excludedUncertain: rows.filter((row) => row.expected === 'uncertain').length,
    matrix, errors, falseSupport: errors.filter((row) => row.predicted === 'supported').length,
    missedContradictions: errors.filter((row) => row.expected === 'contradicted').length,
    perCategory: judgmentCategories.map((category) => ({ category,
      expectedCount: eligible.filter((row) => row.expected === category).length,
      falsePositives: errors.filter((row) => row.predicted === category).length,
      falseNegatives: errors.filter((row) => row.expected === category).length })) };
}
export function evaluateEvidenceRuns(runs: EvidenceRun[], reviews: EvidenceReview[], model = '', configuration: unknown = defaultConfigurations.evidence) {
  const latest = new Map<string, EvidenceRun>();
  for (const run of runs) if ((!model || run.result.assessment.response.model === model)
    && configurationIdentity(run.result.questionConfiguration ?? defaultConfigurations.evidence) === configurationIdentity(configuration)) latest.set(run.result.caseId, run);
  const rows: ComparisonRow[] = [...latest.values()].map((run) => {
    const review = reviews.find((entry) => entry.controlId === run.result.controlId && equal(entry.passage, run.result.passage));
    const answer = run.result.assessment.response.answers.evidence_judgment;
    if (answer.type !== 'choice') throw new Error('Expected evidence Choice.');
    return { runId: run.id, caseId: run.result.caseId, passage: run.result.passage,
      expected: review?.judgment ?? null, predicted: answer.choice as JudgmentCategory };
  });
  return { ...scoreEvidenceRows(rows), rows, missingPredictions: manifest.cases.length - rows.length,
    actualModels: [...new Set([...latest.values()].map((run) => run.result.assessment.response.model))] };
}
export function exportEvidenceExperiment(runs: EvidenceRun[], reviews: EvidenceReview[], model = '', search?: EvidenceSearchSnapshot, configuration: unknown = defaultConfigurations.evidence) {
  const selected = validateQuestionConfiguration(configuration, 'evidence');
  return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(),
    experiment: manifest, datasetVersion: DATASET_VERSION, questionVersion: selected.version,
    questionConfiguration: selected.questions, selectedConfiguration: selected, corpusAndRetrieval: JSON.parse(exportEvidence(reviews)),
    documents: evidenceDocuments, runs, humanReviewsAtExport: reviews, modelFilter: model || 'all actual models (pooled)',
    selectionPolicy: 'Latest appended run per case after actual-model and exact configuration-content/version filters; current saved human reviews; uncertain and unlabeled excluded.',
    classificationEvaluation: evaluateEvidenceRuns(runs, reviews, model, configuration), ...(search ? { search } : {}) }, null, 2);
}
