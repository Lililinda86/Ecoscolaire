import { test, expect } from '@playwright/test';

test('Parent Portal - Visibility and Blockage', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('login-email').fill('parent1.alpha@ecoscolaire.com');
  await page.getByTestId('login-password').fill('Test@2026Alpha!');
  await page.getByTestId('login-submit').click();
  
  await page.waitForTimeout(2000);
  const pageText = await page.content();
  
  // They should not see beta students or all students
  expect(pageText).not.toContain('Beta');
});
