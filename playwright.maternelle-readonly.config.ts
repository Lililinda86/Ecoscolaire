import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['maternelle-labels-readonly.spec.ts', 'maternelle-auth-readonly.spec.ts'],
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 600_000,
  expect: { timeout: 30_000 },
  reporter: 'line',
  outputDir: 'test-results/maternelle-readonly',
  use: { ...devices['Desktop Chrome'], trace: 'off', screenshot: 'off', video: 'off' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5187 --strictPort',
    url: 'http://127.0.0.1:5187/tests/visual/maternelle-picker.html',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
