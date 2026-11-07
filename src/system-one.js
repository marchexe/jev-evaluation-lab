import { performance } from 'node:perf_hooks';
import { TypeSafeClient, VERSION } from '@typesafe-ai/sdk';

// Shared server-only transport: one call, no retries; preserve the SDK response.
/**
 * @param {any} request
 * @param {{profile: string, apiKey?: string, signal?: AbortSignal}} options
 */
export async function runSystemOne(request, { profile, apiKey = process.env.TYPESAFE_API_KEY, signal }) {
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
