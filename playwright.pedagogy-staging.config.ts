import { defineConfig, devices } from "@playwright/test";

const appUrl = process.env.STAGING_APP_URL;
if (!appUrl) throw new Error("STAGING_APP_URL is required.");

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: appUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: bypass
      ? {
          "x-vercel-protection-bypass": bypass,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
