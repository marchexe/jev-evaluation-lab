// Server-only configuration; no credentials or environment values are sent to the client.
export function isLiveInferenceEnabled() {
  return process.env.JEV_LIVE_INFERENCE_ENABLED === 'true';
}
