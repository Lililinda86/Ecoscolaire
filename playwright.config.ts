import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: process.env.FIRESTORE_EMULATOR_HOST ? undefined : '**/security/**',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.PEDAGOGY_SAFE_CI === 'true' ? 0 : process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: process.env.PEDAGOGY_SAFE_CI === 'true' ? 'off' : 'on-first-retry',
    screenshot: process.env.PEDAGOGY_SAFE_CI === 'true' ? 'off' : 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
