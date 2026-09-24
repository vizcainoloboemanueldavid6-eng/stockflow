import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

/**
 * End-to-end tests: `npm run test:e2e`.
 *
 * By default Playwright starts everything itself (see the webServer list):
 *   1. scripts/e2e-db.mjs      - freshly migrated and seeded database (`stockflow_e2e` on the
 *                                embedded PostgreSQL, :54329; started if not running)
 *   2. scripts/e2e-server.mjs  - `npm run build`, then `next start` on :3100
 *   3. the same build on :3101 with ALLOW_REGISTRATION=false and DEMO_ENABLED=false
 *      (the "closed" project checks that both switches are enforced on the server)
 * Set E2E_SKIP_BUILD=1 to reuse the current .next build.
 *
 * Against servers you started yourself: E2E_BASE_URL=http://localhost:3100
 * (and optionally E2E_CLOSED_BASE_URL for the closed-registration project).
 *
 * Browsers: @playwright/test is pinned to 1.57.0, whose Chromium build is the one cached
 * on the development machine - do not run `playwright install` there.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const CLOSED_PORT = Number(process.env.E2E_CLOSED_PORT ?? 3101);
const DB_READY_PORT = Number(process.env.E2E_DB_READY_PORT ?? 3119);
const external = Boolean(process.env.E2E_BASE_URL);

const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const closedBaseURL =
  process.env.E2E_CLOSED_BASE_URL ?? (external ? undefined : `http://localhost:${CLOSED_PORT}`);

const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  `postgresql://postgres:postgres@localhost:${process.env.PG_LOCAL_PORT ?? 54329}/stockflow_e2e`;

const webServer: PlaywrightTestConfig['webServer'] = external
  ? undefined
  : [
      {
        command: 'node scripts/e2e-db.mjs',
        url: `http://127.0.0.1:${DB_READY_PORT}/ready`,
        env: { E2E_DB_READY_PORT: String(DB_READY_PORT) },
        reuseExistingServer: false,
        timeout: 300_000,
      },
      {
        command: 'node scripts/e2e-server.mjs',
        url: `${baseURL}/login`,
        env: { PORT: String(PORT), DATABASE_URL: databaseUrl },
        reuseExistingServer: false,
        timeout: 900_000,
      },
      {
        command: 'node scripts/e2e-server.mjs',
        url: `http://localhost:${CLOSED_PORT}/login`,
        env: {
          PORT: String(CLOSED_PORT),
          DATABASE_URL: databaseUrl,
          E2E_SKIP_BUILD: '1',
          ALLOW_REGISTRATION: 'false',
          DEMO_ENABLED: 'false',
        },
        reuseExistingServer: false,
        timeout: 180_000,
      },
    ];

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: false,
  // One worker: the tests share one database and the in-memory login rate limiter.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: [/.*\.mobile\.spec\.ts/, /.*\.closed\.spec\.ts/],
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /.*\.mobile\.spec\.ts/ },
    ...(closedBaseURL
      ? [
          {
            name: 'closed',
            use: {
              ...devices['Desktop Chrome'],
              viewport: { width: 1440, height: 900 },
              baseURL: closedBaseURL,
            },
            testMatch: /.*\.closed\.spec\.ts/,
          },
        ]
      : []),
  ],
  webServer,
});
