import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: 'maternelle-emulator-readonly.spec.ts',
  fullyParallel: false, forbidOnly: true, retries: 0, workers: 1, timeout: 180_000,
  expect: { timeout: 30_000 }, reporter: 'line', outputDir: 'test-results/maternelle-emulator',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:5188', viewport: { width: 1440, height: 1050 }, trace: 'off', screenshot: 'off', video: 'off' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5188 --strictPort',
    url: 'http://127.0.0.1:5188', reuseExistingServer: false, timeout: 120_000,
    env: {
      VITE_USE_FIREBASE_EMULATORS: 'true', VITE_FIREBASE_PROJECT_ID: 'demo-maternelle-pr201',
      VITE_FIREBASE_API_KEY: 'emulator-only-key', VITE_FIREBASE_AUTH_DOMAIN: 'demo-maternelle-pr201.firebaseapp.com',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-maternelle-pr201.appspot.com', VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
      VITE_FIREBASE_APP_ID: '1:1234567890:web:emulator-only',
    },
  },
});
