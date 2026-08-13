import { defineConfig, devices } from '@playwright/test';

const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:8000';
const APP_URL = process.env['E2E_APP_URL'] ?? 'http://localhost:4200';

/**
 * End-to-end suite.
 *
 * These run against a real Django API and a real Angular dev server — the point is to
 * catch the failures unit tests structurally cannot, such as a guard and a server
 * permission disagreeing about what a role may do.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // The suite shares one database; serial keeps state predictable.
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: APP_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Reuse a server that is already up locally; start one in CI.
  webServer: process.env['E2E_NO_SERVER']
    ? undefined
    : [
        {
          command: 'npm start',
          url: APP_URL,
          reuseExistingServer: !process.env['CI'],
          timeout: 120_000,
        },
      ],

  metadata: { apiUrl: API_URL },
});
