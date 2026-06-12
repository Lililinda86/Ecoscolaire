import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test('Permissions: Teacher cannot see finances', async ({ page }) => {
  await loginAs(page, 'teacher1.alpha@ecoscolaire.com', 'Test@2026Alpha!');
  
  await page.waitForTimeout(2000);
  const pageText = await page.content();
  expect(pageText).not.toContain('Finances');
  expect(pageText).not.toContain('Abonnements SaaS');
});

test('Permissions: Driver sees only bus', async ({ page }) => {
  await loginAs(page, 'driver.alpha@ecoscolaire.com', 'Test@2026Alpha!');
  
  await page.waitForTimeout(2000);
  const pageText = await page.content();
  expect(pageText).not.toContain('Finances');
  expect(pageText).not.toContain('Notes');
});
