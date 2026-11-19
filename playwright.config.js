/* Signature Studio — Playwright E2E config.
   Serves the static app with python3 http.server (no build step) and runs
   Chromium against http://127.0.0.1:8137 (localhost = secure context, so the
   service worker works). Local: no retries, reuse an already-running server.
   CI: retries 2, forbidOnly, always start a fresh server. */
'use strict';

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /* CI runners are small: cap workers and give slow specs breathing room
     (a crowded runner was observed to fail the suite at default workers). */
  workers: process.env.CI ? 4 : undefined,
  timeout: process.env.CI ? 60_000 : 30_000,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:8137',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'python3 -m http.server 8137 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8137',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
