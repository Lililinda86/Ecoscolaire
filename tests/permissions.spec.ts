import { test, expect } from '@playwright/test';

test('Permissions: Teacher cannot see finances', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('login-email').fill('teacher1.alpha@ecoscolaire.com');
  await page.getByTestId('login-password').fill('Test@2026Alpha!');
  await page.getByTestId('login-submit').click();
  
  await page.waitForTimeout(2000);
  const pageText = await page.content();
  expect(pageText).not.toContain('Finances');
  expect(pageText).not.toContain('Abonnements SaaS');
});

test('Permissions: Driver sees only bus', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('login-email').fill('driver.alpha@ecoscolaire.com');
  await page.getByTestId('login-password').fill('Test@2026Alpha!');
  await page.getByTestId('login-submit').click();
  
  await page.waitForTimeout(2000);
  const pageText = await page.content();
  expect(pageText).not.toContain('Finances');
  expect(pageText).not.toContain('Notes');
});
