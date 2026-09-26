import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright harness (plan task A19 — configuration only; the specs belong to a
 * later task).
 *
 * The suite drives a **production build** on port 3100 so it never races the
 * dev server's HMR and so the service worker behaves the way it will in
 * production. The environment comes from `.env.test`, loaded here and handed to
 * `webServer.env` explicitly: there is then exactly one answer to "which
 * database is this server talking to?".
 */

const ENV_FILE = '.env.test';
const loaded = loadEnv({ path: path.resolve(process.cwd(), ENV_FILE), override: false, quiet: true });
if (loaded.error) {
  throw new Error(`Playwright needs ${ENV_FILE}. Copy .env.example and point DATABASE_URL at kno_notes_test.`);
}

const env = loaded.parsed ?? {};
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/** `.env.test` values, with `NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH` forced on. */
export const E2E_ENV: Record<string, string> = {
  ...env,
  // contracts §4: Playwright must never spawn the embedding worker, so CI can
  // never download ~30 MB of model weights.
  NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH: '1',
  PORT: String(PORT),
};

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',

  // One shared seeded database: specs must not run against each other.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  // At least one retry so the `on-first-retry` artefacts below can ever fire.
  retries: process.env.CI ? 2 : 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',

  use: {
    baseURL,
    storageState: 'e2e/.auth/user.json',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    // Playwright has no `on-first-retry` for screenshots; this is the closest
    // equivalent and costs nothing on a green run.
    screenshot: 'only-on-failure',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    colorScheme: 'light',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      // The Design Spec's mobile target. Chromium rather than WebKit so a
      // checkout only ever needs `playwright install chromium`.
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],

  webServer: {
    command: 'npm run build && npm run start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: E2E_ENV,
  },
});
