import { createInferenceHandler } from './assessment-route.js';
import { judgeEvidence } from './evidence-assessment.ts';
import { resolveEvidenceTarget } from '../ui/evidence-runs.ts';
import { validateQuestionConfiguration } from '../question-config.js';

/** @param {(target: string | {passageId: string, controlId: string}, options: {live: boolean, signal: AbortSignal}) => Promise<unknown>} judge */
export function createEvidenceHandler(judge = judgeEvidence) {
  const target = input => Object.hasOwn(input, 'caseId') ? input.caseId : { passageId: input.passageId, controlId: input.controlId };
  return createInferenceHandler((input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || input.live !== true
      || Object.keys(input).some((key) => !['caseId', 'passageId', 'controlId', 'live', 'questionConfiguration'].includes(key))
      || (Object.hasOwn(input, 'caseId') ? typeof input.caseId !== 'string' || Object.hasOwn(input, 'passageId') || Object.hasOwn(input, 'controlId')
        : typeof input.passageId !== 'string' || typeof input.controlId !== 'string')) {
      return { error: 'Provide caseId OR passageId and controlId, live: true and optionally questionConfiguration. Other fields are rejected.' };
    }
    try { resolveEvidenceTarget(target(input)); } catch { return { error: 'Unknown or changed evidence source/control.' }; }
    if (input.questionConfiguration !== undefined) {
      try { validateQuestionConfiguration(input.questionConfiguration, 'evidence'); }
      catch (error) { return { error: error.message }; }
    }
  }, (input, signal) => judge(target(input), { live: true, signal,
    ...(input.questionConfiguration === undefined ? {} : { questionConfiguration: input.questionConfiguration }) }));
}
