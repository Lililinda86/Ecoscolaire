import { test, expect } from '@playwright/test';

test('Multi-tenant isolation: Alpha owner cannot see Beta students', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('login-email').fill('owner.alpha@ecoscolaire.com');
  await page.getByTestId('login-password').fill('Test@2026Alpha!');
  await page.getByTestId('login-submit').click();
  
  // Go to students section
  await page.locator('text=Élèves').click();
  
  // Wait for the table to load
  await page.waitForTimeout(2000);
  
  // Check that at least one Alpha student exists and no Beta mentions
  const pageText = await page.content();
  expect(pageText).toContain('TestAlpha');
  expect(pageText).not.toContain('Beta');
});

test('Multi-tenant isolation: Beta owner cannot see Alpha students', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('login-email').fill('owner.beta@ecoscolaire.com');
  await page.getByTestId('login-password').fill('Test@2026Beta!');
  await page.getByTestId('login-submit').click();
  
  await page.locator('text=Élèves').click();
  await page.waitForTimeout(2000);
  
  const pageText = await page.content();
  expect(pageText).not.toContain('TestAlpha');
});
