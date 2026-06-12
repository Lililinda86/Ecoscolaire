import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test('Anonymous user is redirected from / to /login', async ({ page }) => {
  await page.goto('/');
  // Attendre la redirection
  await page.waitForURL('**/login', { timeout: 10000 });
  
  // Vérifier qu'on est bien sur la page de login
  const emailInput = page.getByTestId('login-email');
  await expect(emailInput).toBeVisible();
});

test('Anonymous user navigating to /#/ is redirected to /#/login', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForURL('**/login', { timeout: 10000 });
  
  const emailInput = page.getByTestId('login-email');
  await expect(emailInput).toBeVisible();
});
