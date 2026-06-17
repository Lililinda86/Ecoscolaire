import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('P0-022: Parent Portal Blockade Scenarios', () => {

  // alpha-student-1 is the target student for parent1.alpha@ecoscolaire.com
  // We need to set the database state before each test using an API or we can just do it in one flow,
  // but we can't easily manipulate the DB from within the Playwright test unless we run a node script before.

  test('Scénario 1 - Parent payé (T1 = 0 ou soldée)', async ({ page }) => {
    // Requires alpha-student-1 to have feeT1 = 50000 and a payment of 50000
    // The default seed has feeT1=50000 and alpha-pay-1 (amount=50000)
    await loginAs(page, 'parent1.alpha@ecoscolaire.com', 'Test@2026Alpha!');
    await page.waitForTimeout(2000);
    
    await expect(page.getByRole('button', { name: 'Vue d\'ensemble' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Présences' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finances' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dossier Bloqué' })).not.toBeVisible();
  });

});
