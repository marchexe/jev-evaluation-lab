import { runSystemOne } from './system-one.js';
import { questions } from './questions.js';
import { governanceQuestions } from './governance.js';
import { configuredQuestions } from './server/question-builders.js';
import { validateQuestionConfiguration } from './question-config.js';

const profiles = new Map([
  ['technical', questions],
  ['governance', governanceQuestions],
]);

/** @param {string} description @param {{profile?: string, model?: string, questionConfiguration?: any}} options */
export function buildAssessmentRequest(description, {
  profile = 'technical',
  model = process.env.TYPESAFE_DEFAULT_MODEL?.trim() || 'jev-latest',
  questionConfiguration,
} = {}) {
  if (!profiles.has(profile)) throw new Error('Unknown profile. Use technical or governance.');
  if (typeof description !== 'string' || !description.trim()) {
    throw new Error('The input description must not be empty.');
  }
  if (typeof model !== 'string' || !model.trim()) throw new Error('The model must be a nonempty string.');
  if (questionConfiguration !== undefined && profile !== 'governance') throw new Error('Custom configurations require the governance profile.');
  return {
    model: model.trim(),
    state: { ai_system_description: description.trim() },
    questions: questionConfiguration === undefined ? structuredClone(profiles.get(profile)) : configuredQuestions(questionConfiguration, 'governance'),
  };
}

/**
 * Server-side API: no filesystem writes, logging, or .env loading. Preview by default.
 * @param {string} description
 * @param {{profile?: string, model?: string, live?: boolean, apiKey?: string, signal?: AbortSignal, questionConfiguration?: any}} options
 */
export async function assessDescription(description, {
  profile = 'technical',
  model,
  live = false,
  apiKey = process.env.TYPESAFE_API_KEY,
  signal,
  questionConfiguration,
} = {}) {
  if (typeof live !== 'boolean') throw new Error('live must be a boolean; only true permits an API call.');
  const request = buildAssessmentRequest(description, { profile, model, questionConfiguration });
  const metadata = questionConfiguration === undefined ? {} : { questionConfiguration: validateQuestionConfiguration(questionConfiguration, 'governance') };
  if (!live) return { schemaVersion: 1, profile, mode: 'preview', request, ...metadata };
  return { ...await runSystemOne(request, { profile, apiKey, signal }), ...metadata };
}
