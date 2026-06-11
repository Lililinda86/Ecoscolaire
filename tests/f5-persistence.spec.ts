import { test, expect } from '@playwright/test';

test('F5 Persistence after login', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('login-email').fill('owner.alpha@ecoscolaire.com');
  await page.getByTestId('login-password').fill('Test@2026Alpha!');
  await page.getByTestId('login-submit').click();
  
  await page.waitForTimeout(2000);
  await page.reload();
  
  // Verify we are still logged in
  await expect(page.locator('button:has-text("Déconnexion"), button:has-text("Logout"), .lucide-log-out').first()).toBeVisible({ timeout: 10000 });
});
