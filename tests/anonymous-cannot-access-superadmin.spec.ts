import { test, expect } from '@playwright/test';

test('Anonymous user cannot access /superadmin', async ({ page }) => {
  await page.goto('/#/superadmin');
  await page.waitForURL('**/login', { timeout: 10000 });
  
  const emailInput = page.getByTestId('login-email');
  await expect(emailInput).toBeVisible();
});
