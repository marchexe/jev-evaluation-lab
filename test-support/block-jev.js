// Browser QA uses recorded responses. Block live inference even if local credentials exist.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'api.typesafe.ai') throw new Error('Live Jev requests are disabled during verification.');
  return originalFetch(input, init);
};
