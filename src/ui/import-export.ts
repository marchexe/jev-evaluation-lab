import type { Assessment, AssessmentRecord } from './types';
import { readHistory, MAX_HISTORY_RECORDS } from './history';
import { validateQuestionConfiguration, configurationIdentity } from '../question-config.js';
import { experiment, readEvidenceRuns, MAX_EVIDENCE_RUNS, type EvidenceRun } from './evidence-runs';
import { evidenceDocuments, DATASET_VERSION, SEARCH_DATASET_VERSION, searchDocuments, searchControls, saveEvidenceReview, type EvidenceReview } from './evidence';

export const MAX_IMPORT_BYTES = 2_000_000;
const object = (v: any) => v && typeof v === 'object' && !Array.isArray(v);
const probability = (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const nonempty = (v: any) => typeof v === 'string' && !!v.trim();
const same = (a: unknown, b: unknown) => configurationIdentity(a) === configurationIdentity(b);
export function parseImport(text: string): any {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) throw new Error('JSON import exceeds 2 MB.');
  return JSON.parse(text);
}

/** Validation only: never rounds or reconstructs the original SDK response. */
export function validateAssessment(value: any): asserts value is Assessment {
  const r = value?.response, q = value?.request?.questions;
  if (value?.schemaVersion !== 1 || value.mode !== 'live' || !nonempty(value.profile)
    || !nonempty(value.request?.model) || !object(q) || !Object.keys(q).length
    || !nonempty(r?.model) || !object(r.answers) || !object(r.usage)
    || !Number.isFinite(Date.parse(value.startedAt)) || !nonempty(value.sdkVersion)
    || !(value.requestId === null || nonempty(value.requestId)) || !Number.isFinite(value.latencyMs) || value.latencyMs < 0
    || ['input_tokens', 'output_tokens'].some((key) => r.usage[key] !== null && (!Number.isInteger(r.usage[key]) || r.usage[key] < 0))
    || !same(Object.keys(r.answers).sort(), Object.keys(q).sort())) throw new Error('Invalid assessment metadata, questions or usage.');
  for (const [field, a] of Object.entries(r.answers) as [string, any][]) {
    if (!object(a) || a.type !== q[field]?.type) throw new Error('Answer type differs from recorded question.');
    if (a.type === 'noul') { if (!probability(a.noul)) throw new Error('Invalid Noul.'); continue; }
    if (!['choice', 'score'].includes(a.type) || !object(a.probabilities) || !Object.keys(a.probabilities).length
      || !Object.values(a.probabilities).every(probability)
      || Math.abs(Object.values(a.probabilities).reduce<number>((n, v) => n + Number(v), 0) - 1) > 0.02
      || (a.confidence != null && !probability(a.confidence))) throw new Error('Invalid probability distribution.');
    if (a.type === 'choice' && (!Object.hasOwn(a.probabilities, a.choice) || !same(Object.keys(a.probabilities).sort(), Object.keys(q[field].criteria ?? {}).sort()))) throw new Error('Invalid Choice options.');
    if (a.type === 'score' && (!Number.isFinite(a.score) || a.score < 0 || a.score > 3 || !object(a.legend)
      || !same(Object.keys(a.legend).sort(), ['0', '1', '2', '3']) || !same(Object.keys(a.probabilities).sort(), Object.keys(a.legend).sort()))) throw new Error('Invalid Score rubric.');
  }
  if (value.questionConfiguration !== undefined) {
    const config = validateQuestionConfiguration(value.questionConfiguration, 'governance');
    if (!same(config.questions, q)) throw new Error('Question configuration differs from executed request.');
  }
}

export function importAssessmentHistory(value: any, current: AssessmentRecord[] = []) {
  if (value?.schemaVersion !== 2 || !Array.isArray(value.assessments)) throw new Error('Expected schemaVersion 2 history export.');
  const imported = readHistory({ getItem: () => JSON.stringify(value.assessments) });
  const next = [...current], ids = new Set();
  for (const record of imported) {
    if (!record.id.trim() || ids.has(record.id) || record.timestamp !== record.assessment.startedAt
      || record.feedback.comment.length > 2000) throw new Error('Invalid or duplicate history record.');
    ids.add(record.id); validateAssessment(record.assessment);
    const previous = next.find((r) => r.id === record.id);
    if (previous && !same(previous, record)) throw new Error('Conflicting assessment ID; existing history was not replaced.');
    if (!previous) next.push(record);
  }
  if (next.length > MAX_HISTORY_RECORDS) throw new Error('Import would exceed history capacity.');
  return next;
}

export function importEvidenceExperiment(value: any, currentRuns: EvidenceRun[] = [], currentReviews: EvidenceReview[] = []) {
  if (value?.schemaVersion !== 1 || !same(value.experiment, experiment) || value.datasetVersion !== DATASET_VERSION
    || !same(value.documents, evidenceDocuments) || !Array.isArray(value.humanReviewsAtExport)) throw new Error('Foreign or changed evidence experiment.');
  const imported = readEvidenceRuns({ getItem: () => JSON.stringify({ schemaVersion: 1, runs: value.runs }) });
  const corpus = { version: SEARCH_DATASET_VERSION, documents: searchDocuments, controls: searchControls };
  if ((value.corpus !== undefined && !same(value.corpus, corpus))
    || (imported.some(run => run.result.experimentId !== experiment.id) && value.corpus === undefined)) throw new Error('Missing or changed evidence corpus.');
  const runs = [...currentRuns], reviews = [...currentReviews], ids = new Set();
  for (const run of imported) {
    validateAssessment(run.result.assessment);
    const previous = runs.find((r) => r.id === run.id);
    if (previous && !same(previous, run)) throw new Error('Conflicting run ID; export existing runs first.');
    if (!previous) runs.push(run);
  }
  for (const review of value.humanReviewsAtExport) {
    saveEvidenceReview([], review, review?.controlId, review?.passage);
    const key = `${review.controlId}/${review.passage.id}`;
    if (ids.has(key)) throw new Error('Duplicate imported review.'); ids.add(key);
    const previous = reviews.find((r) => r.controlId === review.controlId && r.passage.id === review.passage.id);
    if (previous && !same(previous, review)) throw new Error('Conflicting review; existing labels were not replaced.');
    if (!previous) reviews.push(review);
  }
  if (runs.length > MAX_EVIDENCE_RUNS) throw new Error('Import would exceed run capacity.');
  // Stored derived summaries are deliberately ignored and recalculated by the application.
  return { runs, reviews };
}
