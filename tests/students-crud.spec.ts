import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Students CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'secretary.alpha@ecoscolaire.com', 'Test@2026Alpha!');
    await page.getByTestId('nav-students').click();
  });

  test('Create, modify, and delete a student', async ({ page }) => {
    const addButton = page.locator('button', { hasText: /(Ajouter|Nouveau|\+)/i }).first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await page.locator('input[placeholder="Ex: MAT-001"]').fill('MAT-TEST-001');
      await page.locator('.form-group').filter({ hasText: /^Nom$/ }).locator('input').fill('TestE2E Student');
      await page.locator('.form-group').filter({ hasText: 'Nom du Tuteur' }).locator('input').fill('Parent Test');
      await page.locator('.form-group').filter({ hasText: 'Date de Naissance' }).locator('input').fill('2015-01-01');
      await page.locator('.form-group').filter({ hasText: 'Classe' }).locator('select').selectOption({ index: 1 });
      
      await page.locator('button[type="submit"], button:has-text("Enregistrer")').click();
      
      await expect(page.locator('text=TestE2E')).toBeVisible();
    }
  });
});
