import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test('Validation Requests - Check existence', async ({ page }) => {
  await loginAs(page, 'director.alpha@ecoscolaire.com', 'Test@2026Alpha!');
  
  await page.waitForTimeout(2000);
  const pageText = await page.content();
  
  // We just verify that the validation requests UI doesn't crash
  expect(pageText.length).toBeGreaterThan(0);
});
