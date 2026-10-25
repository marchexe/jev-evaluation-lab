import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { NextRequest } from 'next/server.js';
import {
  APIConnectionError, APIError, APITimeoutError, APIUserAbortError,
} from '@typesafe-ai/sdk';
import { createAssessmentHandler } from '../src/server/assessment-route.js';
import { isLiveInferenceEnabled } from '../src/server/config.js';

const configKeys = ['JEV_LIVE_INFERENCE_ENABLED', 'JEV_ALLOWED_ORIGINS', 'JEV_TRUST_PROXY_HEADERS'];
let previousConfig;
beforeEach(() => {
  previousConfig = Object.fromEntries(configKeys.map((key) => [key, process.env[key]]));
  for (const key of configKeys) delete process.env[key];
  process.env.JEV_LIVE_INFERENCE_ENABLED = 'true';
});
afterEach(() => {
  for (const key of configKeys) {
    if (previousConfig[key] === undefined) delete process.env[key]; else process.env[key] = previousConfig[key];
  }
});

function request(body, options = {}) {
  return new Request('http://localhost:3000/api/assess', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify(body), ...options,
  });
}

test('invalid API requests never invoke assessment', async () => {
  let calls = 0;
  const handle = createAssessmentHandler(async () => { calls++; throw new Error('must not run'); });
  for (const body of [null, [], {}, { description: '' }, { description: 'x' },
    { description: 'x', live: 'true' }, { description: ' ', live: true },
    { description: 'x'.repeat(12001), live: true },
    { description: 'x', live: true, apiKey: 'not-accepted' },
    { description: 'x', live: true, profile: 'technical' }]) {
    assert.equal((await handle(request(body))).status, 400);
  }
  assert.equal((await handle(request({}, { body: '{invalid' }))).status, 400);
  assert.equal((await handle(request({}, { headers: { 'content-type': 'text/plain' } }))).status, 415);
  assert.equal((await handle(request({}, { headers: { 'content-type': 'application/json', origin: 'https://other.example' } }))).status, 403);
  assert.equal((await handle(request({}, { body: 'x'.repeat(64001) }))).status, 413);
  assert.equal((await handle(new Request('http://localhost:3000/api/assess'))).status, 405);
  assert.equal(calls, 0);
});

test('real NextRequest loopback normalization preserves each local same-origin authority', async () => {
  const before = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = ' ';
  try {
    const handle = createAssessmentHandler(async () => { assert.fail('No inference during origin tests.'); });
    for (const scheme of ['http', 'https']) {
      for (const host of ['127.0.0.1:3000', 'localhost:3000', '127.0.0.1:3197', 'localhost:3197']) {
        const origin = `${scheme}://${host}`;
        const req = new NextRequest(`${origin}/api/assess`, {
          method: 'POST', body: JSON.stringify({ description: 'Offline origin regression.', live: true }),
          headers: { host, origin, 'content-type': 'application/json',
            'x-forwarded-host': host, 'x-forwarded-proto': scheme },
        });
        assert.equal(new URL(req.url).hostname, 'localhost');
        const response = await handle(req);
        assert.equal(response.status, 503, `${origin} must pass origin validation and stop at the missing API key.`);
      }
    }
  } finally {
    if (before === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = before;
  }
});

test('external origins, cross-host requests, ports, schemes and spoofed forwarded headers stay forbidden', async () => {
  const handle = createAssessmentHandler(async () => { assert.fail('Rejected origins must never invoke Jev.'); });
  for (const headers of [
    { host: '127.0.0.1:3000', origin: 'https://evil.example' },
    { host: 'localhost:3000', origin: 'http://localhost:3000.evil.example' },
    { host: '127.0.0.1:3000', origin: 'http://localhost:3000' },
    { host: 'localhost:3000', origin: 'http://127.0.0.1:3000' },
    { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3001' },
    { host: '127.0.0.1:3001', origin: 'http://127.0.0.1:3001' },
    { host: 'localhost:3000', origin: 'https://localhost:3000' },
    { host: 'localhost:3000', origin: 'null' },
    { host: 'localhost:3000', origin: 'invalid origin' },
    { host: 'localhost:3000', origin: 'http://localhost:3000/extra-path' },
    { host: 'evil.example', origin: 'http://evil.example' },
    { host: 'localhost:3000', origin: 'https://evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' },
    { host: 'localhost:3000', origin: 'http://127.0.0.1:3000', 'x-forwarded-host': '127.0.0.1:3000' },
  ]) {
    const req = new NextRequest('http://127.0.0.1:3000/api/assess', {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ description: 'Offline rejected-origin regression.', live: true }),
    });
    assert.equal((await handle(req)).status, 403, JSON.stringify(headers));
  }
});

test('API reports missing configuration and cancellation without inference', async () => {
  const before = process.env.TYPESAFE_API_KEY;
  try {
    process.env.TYPESAFE_API_KEY = '';
    let calls = 0;
    const handle = createAssessmentHandler(async () => { calls++; });
    assert.equal((await handle(request({ description: 'Example', live: true }))).status, 503);
    const controller = new AbortController(); controller.abort();
    assert.equal((await handle(request({ description: 'Example', live: true }, { signal: controller.signal }))).status, 499);
    assert.equal(calls, 0);
  } finally {
    if (before === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = before;
  }
});

test('disabled live inference rejects even explicit valid actions without invoking Jev', async () => {
  process.env.JEV_LIVE_INFERENCE_ENABLED = 'false';
  let calls = 0;
  const handle = createAssessmentHandler(async () => { calls++; });
  const response = await handle(request({ description: 'Example', live: true }));
  assert.equal(response.status, 503); assert.match(await response.text(), /disabled/); assert.equal(calls, 0);
  delete process.env.JEV_LIVE_INFERENCE_ENABLED;
  assert.equal((await handle(request({ description: 'Example', live: true }))).status, 503);
  assert.equal(calls, 0);
});

test('live inference requires the exact explicit server opt-in', () => {
  for (const value of ['', 'false', 'TRUE', ' true ', '1']) {
    process.env.JEV_LIVE_INFERENCE_ENABLED = value;
    assert.equal(isLiveInferenceEnabled(), false);
  }
  delete process.env.JEV_LIVE_INFERENCE_ENABLED;
  assert.equal(isLiveInferenceEnabled(), false);
  process.env.JEV_LIVE_INFERENCE_ENABLED = 'true';
  assert.equal(isLiveInferenceEnabled(), true);
});

test('HTTPS production origins and explicitly trusted proxy origins remain exact and fail closed', async () => {
  const handle = createAssessmentHandler(async () => { assert.fail('Invalid payload must stop before inference'); });
  const publicOrigin = 'https://lab.example.com';
  const incoming = (url, headers) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
  assert.equal((await handle(incoming(`${publicOrigin}/api/assess`, { host: 'lab.example.com', origin: publicOrigin }))).status, 400);
  const proxied = () => incoming('http://internal:3000/api/assess', {
    host: 'internal:3000', origin: publicOrigin, 'x-forwarded-host': 'lab.example.com', 'x-forwarded-proto': 'https',
  });
  assert.equal((await handle(proxied())).status, 403);
  process.env.JEV_TRUST_PROXY_HEADERS = 'true';
  assert.equal((await handle(proxied())).status, 403, 'Opt-in without allowlist must not trust arbitrary hosts');
  process.env.JEV_ALLOWED_ORIGINS = publicOrigin;
  assert.equal((await handle(proxied())).status, 400);
  for (const headers of [
    { origin: 'https://evil.example' }, { origin: 'http://lab.example.com' },
    { origin: 'https://lab.example.com:444' }, { 'x-forwarded-host': 'evil.example' },
    { 'x-forwarded-host': 'lab.example.com, evil.example' }, { 'x-forwarded-proto': 'http' },
    { 'sec-fetch-site': 'cross-site' },
  ]) {
    const req = proxied(); for (const [key, value] of Object.entries(headers)) req.headers.set(key, value);
    assert.equal((await handle(req)).status, 403, JSON.stringify(headers));
  }
  process.env.JEV_ALLOWED_ORIGINS = 'not-an-origin';
  assert.equal((await handle(proxied())).status, 403);
});

test('one explicit API action invokes the existing backend once and sanitizes SDK errors', async () => {
  const before = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = 'offline-secret';
  try {
    const headers = new Headers({ 'x-typesafe-request-id': 'recorded-error-id' });
    const errors = [
      [new APITimeoutError(30000), 504],
      [new APIConnectionError('private network detail'), 502],
      [new APIUserAbortError(), 499],
      [APIError.fromResponse(429, { secret: 'private-body' }, headers), 429],
      [APIError.fromResponse(401, { secret: 'private-body' }, headers), 502],
      [new Error('private stack detail'), 502],
    ];
    for (const [failure, status] of errors) {
      let calls = 0;
      const req = request({ description: 'A synthetic AI system.', live: true });
      const handle = createAssessmentHandler(async (description, options) => {
        calls++;
        assert.equal(description, 'A synthetic AI system.');
        assert.equal(options.profile, 'governance'); assert.equal(options.live, true);
        assert.equal(options.signal, req.signal);
        throw failure;
      });
      const response = await handle(req);
      assert.equal(response.status, status);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.doesNotMatch(await response.text(), /offline-secret|private-body|private network|private stack/);
      assert.equal(calls, 1);
    }
  } finally {
    if (before === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = before;
  }
});
