import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

import { loadStagingCredentials } from './helpers/stagingCredentials';

const { alphaPassword } = loadStagingCredentials(['alpha']);

test('F5 Persistence after login', async ({ page }) => {
  await loginAs(page, 'owner.alpha@ecoscolaire.com', alphaPassword);
  
  await page.waitForTimeout(2000);
  await page.reload();
  
  // Verify we are still logged in
  await expect(page.getByTestId('logout-button').first()).toBeVisible({ timeout: 10000 });
});
