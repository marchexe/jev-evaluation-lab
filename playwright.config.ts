import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:3197', viewport: { width: 1440, height: 1050 }, trace: 'retain-on-failure' },
  webServer: [{
    command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3197',
    url: 'http://127.0.0.1:3197',
    reuseExistingServer: false,
    timeout: 60000,
    env: { TYPESAFE_API_KEY: ' ', JEV_LIVE_INFERENCE_ENABLED: 'true', JEV_ALLOWED_ORIGINS: ' ', JEV_TRUST_PROXY_HEADERS: 'false', NODE_OPTIONS: '--import=./test-support/block-jev.js', NEXT_TELEMETRY_DISABLED: '1' },
  }, {
    command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3198',
    url: 'http://127.0.0.1:3198', reuseExistingServer: false, timeout: 60000,
    env: { TYPESAFE_API_KEY: 'offline-test-key', JEV_LIVE_INFERENCE_ENABLED: 'false', JEV_ALLOWED_ORIGINS: ' ', JEV_TRUST_PROXY_HEADERS: 'false', NODE_OPTIONS: '--import=./test-support/block-jev.js', NEXT_TELEMETRY_DISABLED: '1' },
  }],
});
