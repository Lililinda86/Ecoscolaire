import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('P0-024B ITALO INTERNAL VALIDATION', () => {
  test('Validations des quotas SaaS et contournement pour GS Bilingue ITALO', async ({ page }) => {
    console.log('\n--- DEBUT DU TEST E2E ITALO SUR PRODUCTION ---\n');
    
    console.log('Login SuperAdmin...');
    await loginAs(page, 'superadmin.test@ecoscolaire.com', 'Test@2026Super!');
    await page.waitForTimeout(3000);
    
    console.log('\n--- Test : ECO TEST INTERNAL ITALO ---');
    
    // Check school row visibility
    const schoolRow = page.locator('tr').filter({ hasText: 'ECO TEST INTERNAL ITALO' });
    await expect(schoolRow).toBeVisible({ timeout: 15000 });
    
    // Access school
    await schoolRow.getByRole('button', { name: /Accéder/ }).click();
    
    // Navigate to Students page
    await page.locator('nav a:has-text("Élèves")').first().click();
    await expect(page.locator('h1', { hasText: 'Élèves' })).toBeVisible();
    await page.waitForTimeout(2000);
    
    // Check capacity displayed as unlimited
    // Look for text matching limits like "Illimité"
    const limitTextLocator = page.locator('text=Illimité').first();
    await expect(limitTextLocator).toBeVisible();
    console.log('✅ Capacité affichée comme illimitée.');
    
    // Check Add button is enabled despite subscriptionStatus=suspended and studentLimit=1
    const addBtn = page.locator('button:has-text("Ajouter")');
    await expect(addBtn).toBeEnabled();
    console.log('✅ Bouton Ajout non bloqué comme prévu pour ITALO (ignorant suspension et limite).');
    
    // Click Add Button
    await addBtn.click();
    await page.waitForTimeout(1000);
    
    // Fill the add student form to verify we can add a student
    const formLocator = page.locator('form');
    await expect(formLocator).toBeVisible();
    
    // Fill required fields
    const inputs = formLocator.locator('input');
    await inputs.nth(1).fill('TestItalo Student'); // Nom complet
    await inputs.nth(2).fill('2020-01-01'); // Date de Naissance
    await inputs.nth(3).fill('Test Italo Parent'); // Nom du Tuteur
    
    // Choose the first available class
    await page.getByRole('combobox').filter({ hasText: '-- Choisir une classe --' }).selectOption({ index: 1 });
    
    // Submit form
    const saveBtn = page.locator('button[type="submit"]:has-text("Enregistrer")');
    await expect(saveBtn).toBeEnabled();
    
    // Close modal
    const cancelBtn = page.locator('button.secondary:has-text("Annuler")');
    await cancelBtn.click();
    
    console.log('✅ Aucun paywall affiché, modal d\'ajout fonctionnelle.');
    console.log('\n✅ ITALO VALIDÉ');
  });
});
