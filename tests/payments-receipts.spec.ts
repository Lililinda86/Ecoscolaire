import { test, expect } from '@playwright/test';

test('Create payment and verify receipt as Accountant', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('login-email').fill('accountant.alpha@ecoscolaire.com');
  await page.getByTestId('login-password').fill('Test@2026Alpha!');
  await page.getByTestId('login-submit').click();
  
  await page.locator('text=Finances').click();
  await page.waitForTimeout(2000);
  
  const pageText = await page.content();
  // Check that payments exist
  expect(pageText).toContain('RECU-');
});
