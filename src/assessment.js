import { performance } from 'node:perf_hooks';
import { TypeSafeClient, VERSION } from '@typesafe-ai/sdk';
import { questions } from './questions.js';
import { governanceQuestions } from './governance.js';

const profiles = new Map([
  ['technical', questions],
  ['governance', governanceQuestions],
]);

export function buildAssessmentRequest(description, {
  profile = 'technical',
  model = process.env.TYPESAFE_DEFAULT_MODEL?.trim() || 'jev-latest',
} = {}) {
  if (!profiles.has(profile)) throw new Error('Unknown profile. Use technical or governance.');
  if (typeof description !== 'string' || !description.trim()) {
    throw new Error('The input description must not be empty.');
  }
  if (typeof model !== 'string' || !model.trim()) throw new Error('The model must be a nonempty string.');
  return {
    model: model.trim(),
    state: { ai_system_description: description.trim() },
    questions: structuredClone(profiles.get(profile)),
  };
}

/** Server-side API: no filesystem writes, logging, or .env loading. Preview by default. */
export async function assessDescription(description, {
  profile = 'technical',
  model,
  live = false,
  apiKey = process.env.TYPESAFE_API_KEY,
  signal,
} = {}) {
  if (typeof live !== 'boolean') throw new Error('live must be a boolean; only true permits an API call.');
  const request = buildAssessmentRequest(description, { profile, model });
  if (!live) return { schemaVersion: 1, profile, mode: 'preview', request };
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Set TYPESAFE_API_KEY in your environment or .env before using --live.');
  }

  const client = new TypeSafeClient({
    apiKey: apiKey.trim(),
    baseURL: 'https://api.typesafe.ai',
    logLevel: 'off',
    timeout: 30_000,
    retry: { maxRetries: 0 },
  });
  const startedAt = new Date().toISOString();
  const start = performance.now();
  let result;
  try {
    result = await client.systemOne(request, { signal }).withResponse();
  } catch (error) {
    error.latencyMs = Number((performance.now() - start).toFixed(2));
    throw error;
  }
  return {
    schemaVersion: 1,
    profile,
    mode: 'live',
    startedAt,
    sdkVersion: VERSION,
    requestId: result.requestId ?? null,
    latencyMs: Number((performance.now() - start).toFixed(2)),
    request,
    // Keep the parsed API response intact, including all probabilities and usage.
    response: result.data,
  };
}
