import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Audit Logs E2E', () => {

  test('Verify that sensitive actions generate an audit log and are visible in Audit Logs page', async ({ page }) => {
    test.setTimeout(120000); // 2 mins timeout

    // Auto-accept any dialogs (alerts, confirms)
    page.on('dialog', dialog => dialog.accept());

    // 1. Connect as Director to perform actions
    await loginAs(page, 'director.alpha@ecoscolaire.com', 'Test@2026Alpha!');

    // 2. Perform an action: Create a student
    await page.getByTestId('nav-students').click();
    await expect(page.locator('h1').first()).toContainText('Élèves');
    
    // Click "Nouvel Élève"
    const addButton = page.locator('button', { hasText: /(Ajouter|Nouveau|\+)/i }).first();
    await addButton.click();
    
    // Fill the form
    const uniqueStudentName = `Audit Student ${Date.now()}`;
    await page.locator('.form-group').filter({ hasText: /^Nom$/ }).locator('input').fill(uniqueStudentName);
    await page.locator('.form-group').filter({ hasText: 'Nom du Tuteur' }).locator('input').fill('Parent Test');
    await page.locator('.form-group').filter({ hasText: 'Date de Naissance' }).locator('input').fill('2015-01-01');
    await page.locator('.form-group').filter({ hasText: 'Classe' }).locator('select').selectOption({ index: 1 });
    await page.locator('button[type="submit"], button:has-text("Enregistrer")').click();

    // Wait for modal to close and student to appear
    await expect(page.locator(`text=${uniqueStudentName}`).first()).toBeVisible();

    // 3. Logout Director
    await page.getByTestId('logout-button').click();
    await page.waitForTimeout(1000);

    // 4. Connect as Owner (has access to Audit Logs)
    await loginAs(page, 'owner.alpha@ecoscolaire.com', 'Test@2026Alpha!');

    // 5. Go to Audit Logs
    await page.getByTestId('nav-audit').click();
    await expect(page.locator('h1').first()).toContainText('Journaux d\'Audit');

    // 6. Verify logs are present
    // Search for the specific CREATE_STUDENT log
    await page.fill('input[placeholder="Ex: DELETE_STUDENT"]', 'CREATE_STUDENT');
    await page.waitForTimeout(1000); // Wait for filter

    const createStudentRows = page.locator('tr:has-text("CREATE_STUDENT")');
    await expect(createStudentRows.first()).toBeVisible();
    // It should contain the student's name
    await expect(page.locator(`text=${uniqueStudentName}`).first()).toBeVisible({ timeout: 15000 });

    // 7. Test log immutability (No delete buttons)
    const deleteButtons = page.locator('button:has-text("Supprimer")');
    await expect(deleteButtons).toHaveCount(0); // Should be zero delete buttons on audit logs
  });
});
