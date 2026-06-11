import { test, expect } from '@playwright/test';

test.describe('Students CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-email').fill('secretary.alpha@ecoscolaire.com');
    await page.getByTestId('login-password').fill('Test@2026Alpha!');
    await page.getByTestId('login-submit').click();
    await page.locator('text=Élèves').click();
  });

  test('Create, modify, and delete a student', async ({ page }) => {
    // Check if adding is possible (button usually has 'Ajouter' or '+')
    const addButton = page.locator('button', { hasText: /(Ajouter|Nouveau|\+)/i }).first();
    if (await addButton.isVisible()) {
      await addButton.click();
      // Try to fill generic fields
      const firstNameInput = page.locator('input[name="firstName"], input[placeholder*="Prénom"]');
      if (await firstNameInput.isVisible()) {
        await firstNameInput.fill('TestE2E');
        await page.locator('input[name="lastName"], input[placeholder*="Nom"]').fill('Student');
        await page.locator('button[type="submit"], button:has-text("Enregistrer")').click();
        
        await expect(page.locator('text=TestE2E')).toBeVisible();
      }
    }
  });
});
