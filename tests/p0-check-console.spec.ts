import { test } from '@playwright/test';

test('Check All Console Messages', async ({ page }) => {
  page.on('console', msg => {
    console.log(`[${msg.type().toUpperCase()}] ${msg.text()}`);
  });

  await page.goto('https://ecoscolaire.vercel.app/', { waitUntil: 'networkidle' });
});
