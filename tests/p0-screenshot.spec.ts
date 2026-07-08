import { test } from '@playwright/test';

test('Screenshot production staging', async ({ page }) => {
  await page.goto('https://ecoscolaire.vercel.app/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'production_blank_page_v2.png', fullPage: true });
});
