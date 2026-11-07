import { createInferenceHandler } from './assessment-route.js';
import { judgeEvidence } from './evidence-assessment.ts';
import { resolveEvidenceCase } from '../ui/evidence-runs.ts';
import { validateQuestionConfiguration } from '../question-config.js';

/** @param {(caseId: string, options: {live: boolean, signal: AbortSignal}) => Promise<unknown>} judge */
export function createEvidenceHandler(judge = judgeEvidence) {
  return createInferenceHandler((input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || input.live !== true
      || typeof input.caseId !== 'string' || Object.keys(input).some((key) => !['caseId', 'live', 'questionConfiguration'].includes(key))) {
      return { error: 'Provide caseId, live: true and optionally questionConfiguration. Other fields are rejected.' };
    }
    try { resolveEvidenceCase(input.caseId); } catch { return { error: 'Unknown or changed experiment case.' }; }
    if (input.questionConfiguration !== undefined) {
      try { validateQuestionConfiguration(input.questionConfiguration, 'evidence'); }
      catch (error) { return { error: error.message }; }
    }
  }, (input, signal) => judge(input.caseId, { live: true, signal,
    ...(input.questionConfiguration === undefined ? {} : { questionConfiguration: input.questionConfiguration }) }));
}
