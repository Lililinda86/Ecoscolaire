import { test, expect } from '@playwright/test';

test('Super Admin login and dashboard access', async ({ page }) => {
  await page.goto('/');
  
  await page.getByTestId('login-email').fill('superadmin.test@ecoscolaire.com');
  await page.getByTestId('login-password').fill('Test@2026Super!');
  await page.getByTestId('login-submit').click();
  
  // Verify Dashboard Super Admin visibility
  // Wait for the URL to change or specific dashboard elements
  await expect(page).toHaveURL(/.*dashboard|superadmin.*/, { timeout: 10000 });
  await expect(page.locator('text=Super Admin').first()).toBeVisible();
});
