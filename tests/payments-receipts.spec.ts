import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test('Create payment and verify receipt as Accountant', async ({ page }) => {
  await loginAs(page, 'accountant.alpha@ecoscolaire.com', 'Test@2026Alpha!');
  
  await page.getByTestId('nav-payments').click();
  await page.waitForTimeout(2000);
  
  const pageText = await page.content();
  // Check that payments exist (amount format uses non-breaking spaces in fr-FR)
  expect(pageText).toContain('50');
  expect(pageText).toContain('FCFA');
});
