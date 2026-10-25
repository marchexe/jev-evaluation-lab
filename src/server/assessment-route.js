import {
  APIConnectionError, APIError, APITimeoutError, APIUserAbortError,
} from '@typesafe-ai/sdk';
import { assessDescription } from '../assessment.js';
import { isLiveInferenceEnabled } from './config.js';
import { isSameOrigin } from './origin.js';

export const MAX_DESCRIPTION_LENGTH = 12_000;
const MAX_BODY_BYTES = 64_000;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// The injectable operation is for offline error-path tests, never a second classifier.
export function createAssessmentHandler(assess = assessDescription) {
  return async function handleAssessment(request) {
    if (request.method !== 'POST') return json({ error: 'Use POST to analyze a description.' }, 405);
    if (!isSameOrigin(request)) {
      return json({ error: 'Cross-origin assessment requests are not allowed.' }, 403);
    }
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      return json({ error: 'Send an application/json request.' }, 415);
    }
    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
      return json({ error: 'Request body is too large.' }, 413);
    }

    let input;
    try {
      // Bound the actual stream, including requests with no Content-Length header.
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'A JSON body is required.' }, 400);
      const chunks = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          return json({ error: 'Request body is too large.' }, 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      input = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: 'Request body must be valid JSON.' }, 400);
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some((key) => !['description', 'live'].includes(key))
      || input.live !== true || typeof input.description !== 'string' || !input.description.trim()) {
      return json({ error: 'Provide a nonempty description and live: true. No other fields are accepted.' }, 400);
    }
    if (input.description.length > MAX_DESCRIPTION_LENGTH) {
      return json({ error: `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.` }, 400);
    }
    if (request.signal.aborted) return json({ error: 'Assessment cancelled.' }, 499);
    if (!isLiveInferenceEnabled()) {
      return json({ error: 'Live inference is disabled by server configuration.' }, 503);
    }
    if (!process.env.TYPESAFE_API_KEY?.trim()) {
      return json({ error: 'Set TYPESAFE_API_KEY on the server before analyzing.' }, 503);
    }
    try {
      // One invocation; SDK retries are already disabled in the existing backend.
      const assessment = await assess(input.description, {
        profile: 'governance', live: true, signal: request.signal,
      });
      return json(assessment);
    } catch (error) {
      if (error instanceof APIUserAbortError || request.signal.aborted) {
        return json({ error: 'Assessment cancelled.' }, 499);
      }
      if (error instanceof APITimeoutError) {
        return json({ error: 'Jev timed out. No retry was attempted.' }, 504);
      }
      if (error instanceof APIConnectionError) {
        return json({ error: 'Unable to connect to Jev. No retry was attempted.' }, 502);
      }
      if (error instanceof APIError) {
        const message = error.status === 429 ? 'Jev rate limited the request. Try again manually later.'
          : error.status === 401 || error.status === 403 ? 'Jev rejected the server credentials or account access.'
            : 'Jev could not complete the assessment. No retry was attempted.';
        return json({ error: message, requestId: error.requestId ?? null }, error.status === 429 ? 429 : 502);
      }
      return json({ error: 'Assessment failed. Check the server configuration. No retry was attempted.' }, 502);
    }
  };
}
