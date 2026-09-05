import { defineConfig, devices } from "@playwright/test";

const appUrl = process.env.STAGING_APP_URL;
if (!appUrl) throw new Error("STAGING_APP_URL is required.");
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "line",
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: appUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: vercelBypassSecret
      ? { "x-vercel-protection-bypass": vercelBypassSecret }
      : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
