import { test } from '@playwright/test';

test('Check HTML on Staging', async ({ page }) => {
  await page.goto('https://ecoscolaire.vercel.app/', { waitUntil: 'networkidle' });
  const content = await page.content();
  console.log(content.substring(0, 1000));
});
