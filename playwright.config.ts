import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// One port per worktree: parallel work packages set E2E_PORT so that their
// servers never collide (default 4173). The server is always started afresh.
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}/eek-a-calibrate/`;
const FAKE_VIDEO = fileURLToPath(new URL('./tests/fixtures/generated/face.mjpeg', import.meta.url));

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    permissions: ['camera'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${FAKE_VIDEO}`,
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // scripts/serve-dist.mjs emulates the production .htaccess (spec §10.4); build first.
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { E2E_PORT: String(PORT) },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
