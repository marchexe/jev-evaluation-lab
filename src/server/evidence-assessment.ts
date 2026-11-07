import { runSystemOne } from '../system-one.js';
import { buildEvidenceRequest, resolveEvidenceCase, experiment } from '../ui/evidence-runs';
import { DATASET_VERSION } from '../ui/evidence';
import { defaultConfigurations, validateQuestionConfiguration } from '../question-config.js';
import { configuredQuestions } from './question-builders.js';

export async function judgeEvidence(caseId: string, { signal, live = false, questionConfiguration }: { signal?: AbortSignal; live?: boolean; questionConfiguration?: unknown } = {}) {
  const item = resolveEvidenceCase(caseId);
  const selected = validateQuestionConfiguration(questionConfiguration ?? defaultConfigurations.evidence, 'evidence');
  const request = { ...buildEvidenceRequest(caseId, process.env.TYPESAFE_DEFAULT_MODEL?.trim() || 'jev-latest', selected),
    questions: configuredQuestions(selected, 'evidence') };
  const metadata = { schemaVersion: 1, experimentId: experiment.id, caseId, datasetVersion: DATASET_VERSION,
    questionVersion: selected.version, controlId: item.controlId, passage: item.passage,
    ...(questionConfiguration === undefined ? {} : { questionConfiguration: selected }) };
  if (live !== true) return { ...metadata, mode: 'preview', request };
  return { ...metadata, assessment: await runSystemOne(request, { profile: 'evidence', signal }) };
}
