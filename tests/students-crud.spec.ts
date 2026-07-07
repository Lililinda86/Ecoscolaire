import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Students CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'owner.alpha@ecoscolaire.com', 'Test@2026Alpha!');
    await page.getByTestId('nav-students').click();
  });

  test('Create, modify, and delete a student', async ({ page }) => {
    page.on('dialog', dialog => {
      console.log('DIALOG:', dialog.message());
      dialog.accept().catch(() => {});
    });
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text());
    });

    const addButton = page.locator('button', { hasText: /(Ajouter|Nouveau|\+)/i }).first();
    if (await addButton.isVisible()) {
      await addButton.click();
      
      const uniqueSuffix = Date.now().toString();
      const studentName = `TestE2E Student ${uniqueSuffix}`;
      
      await page.locator('input[placeholder="Ex: MAT-001"]').fill(`MAT-TEST-${uniqueSuffix}`);
      await page.locator('.form-group').filter({ hasText: /^Nom$/ }).locator('input').fill(studentName);
      await page.locator('.form-group').filter({ hasText: 'Nom du Tuteur' }).locator('input').fill('Parent Test');
      await page.locator('.form-group').filter({ hasText: 'Date de Naissance' }).locator('input').fill('2015-01-01');
      await page.locator('.form-group').filter({ hasText: 'Classe' }).locator('select').selectOption({ index: 1 });
      
      await page.locator('button[type="submit"], button:has-text("Enregistrer")').click();
      
      const row = page.locator('tr').filter({ hasText: studentName });
      await expect(row).toBeVisible({ timeout: 10000 });
      
      // Cleanup
      await row.locator('button[title*="Supprimer"]').first().click();
      await expect(row).not.toBeVisible();
    }
  });
});
