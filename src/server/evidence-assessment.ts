import { runSystemOne } from '../system-one.js';
import { buildEvidenceRequest, resolveEvidenceTarget, type EvidenceSelection } from '../ui/evidence-runs';
import { defaultConfigurations, validateQuestionConfiguration } from '../question-config.js';
import { configuredQuestions } from './question-builders.js';

export async function judgeEvidence(target: string | EvidenceSelection, { signal, live = false, questionConfiguration }: { signal?: AbortSignal; live?: boolean; questionConfiguration?: unknown } = {}) {
  const item = resolveEvidenceTarget(target);
  const selected = validateQuestionConfiguration(questionConfiguration ?? defaultConfigurations.evidence, 'evidence');
  const request = { ...buildEvidenceRequest(target, process.env.TYPESAFE_DEFAULT_MODEL?.trim() || 'jev-latest', selected),
    questions: configuredQuestions(selected, 'evidence') };
  const metadata = { schemaVersion: 1, experimentId: item.experimentId, caseId: item.id, datasetVersion: item.datasetVersion,
    questionVersion: selected.version, controlId: item.controlId, passage: item.passage,
    ...(questionConfiguration === undefined ? {} : { questionConfiguration: selected }) };
  if (live !== true) return { ...metadata, mode: 'preview', request };
  return { ...metadata, assessment: await runSystemOne(request, { profile: 'evidence', signal }) };
}
