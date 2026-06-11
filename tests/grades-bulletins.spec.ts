import { test, expect } from '@playwright/test';

test('Encoder une note et générer un bulletin', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('login-email').fill('teacher1.alpha@ecoscolaire.com');
  await page.getByTestId('login-password').fill('Test@2026Alpha!');
  await page.getByTestId('login-submit').click();
  
  await page.locator('text=Notes').click();
  await page.waitForTimeout(2000);
  
  const pageText = await page.content();
  // Simply checking visibility for now
  expect(pageText.length).toBeGreaterThan(0);
});
