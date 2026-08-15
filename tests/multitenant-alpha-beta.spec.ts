import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { loadStagingCredentials } from './helpers/stagingCredentials';

const { alphaPassword, betaPassword } = loadStagingCredentials(['alpha', 'beta']);

test('Multi-tenant isolation: Alpha owner cannot see Beta students', async ({ page }) => {
  await loginAs(page, 'owner.alpha@ecoscolaire.com', alphaPassword);
  
  // Go to students section
  await page.getByTestId('nav-students').click();
  
  // Wait for the table to load
  await page.waitForTimeout(2000);
  
  // Check that at least one Alpha student exists and no Beta mentions
  const pageText = await page.content();
  expect(pageText).toContain('TestAlpha');
  expect(pageText).not.toContain('TestBeta');
});

test('Multi-tenant isolation: Beta owner cannot see Alpha students', async ({ page }) => {
  await loginAs(page, 'owner.beta@ecoscolaire.com', betaPassword);
  
  await page.getByTestId('nav-students').click();
  await page.waitForTimeout(2000);
  
  const pageText = await page.content();
  expect(pageText).not.toContain('TestAlpha');
});
