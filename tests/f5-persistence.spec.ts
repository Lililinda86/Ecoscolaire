import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test('F5 Persistence after login', async ({ page }) => {
  await loginAs(page, 'owner.alpha@ecoscolaire.com', 'Test@2026Alpha!');
  
  await page.waitForTimeout(2000);
  await page.reload();
  
  // Verify we are still logged in
  await expect(page.getByTestId('logout-button').first()).toBeVisible({ timeout: 10000 });
});
