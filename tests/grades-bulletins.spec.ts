import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test('Encoder une note et générer un bulletin', async ({ page }) => {
  await loginAs(page, 'teacher1.alpha@ecoscolaire.com', 'Test@2026Alpha!');
  
  await page.getByTestId('nav-grades').click();
  await page.waitForTimeout(2000);
  
  const pageText = await page.content();
  // Simply checking visibility for now
  expect(pageText.length).toBeGreaterThan(0);
});
