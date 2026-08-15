import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

import { loadStagingCredentials } from './helpers/stagingCredentials';

const { superAdminPassword } = loadStagingCredentials(['superAdmin']);

test('Super Admin login and dashboard access', async ({ page }) => {
  await loginAs(page, 'superadmin.test@ecoscolaire.com', superAdminPassword);
  
  // Verify Dashboard Super Admin visibility
  // Wait for the URL to change or specific dashboard elements
  await expect(page).toHaveURL(/.*dashboard|superadmin.*/, { timeout: 10000 });
  await expect(page.locator('text=Super Admin').first()).toBeVisible();
});
