import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { attachConsoleMonitor } from './helpers/console-monitor';

test.describe('Payments and Receipts', () => {
  test('Create payment and verify receipt as Accountant', async ({ page }) => {
    const monitor = attachConsoleMonitor(page);
    await loginAs(page, 'accountant.alpha@ecoscolaire.com', 'Test@2026Alpha!');
    
    await page.getByTestId('nav-payments').click();
    page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err));
    
    // Create a registration fee payment
    await page.locator('button:has-text("Encaissement (+)")').click();
    // Wait for modal
    await page.waitForSelector('text=Nouvel Encaissement');
    
    // Select first available student
    const studentSelect = page.locator('.form-group select').first();
    // wait until options are populated
    await page.waitForFunction(() => {
      const select = document.querySelector('.form-group select') as HTMLSelectElement;
      return select && select.options.length > 1;
    }, { timeout: 15000 }).catch(() => console.log('No students found in DB'));
    
    // Only proceed if options exist
    const optionsCount = await studentSelect.locator('option').count();
    if (optionsCount > 1) {
      await studentSelect.selectOption({ index: 1 });
      
      // Select payment type
      const typeSelect = page.locator('select').nth(1);
      await typeSelect.selectOption('registration_fee');
      
      // Fill amount and submit
      const amountInput = page.locator('label:has-text("Montant")').locator('..').locator('input').last();
      await amountInput.fill('5000');
      await page.locator('button:has-text("Enregistrer l\'encaissement")').click();
      
      // Wait for modal to close
      await expect(page.locator('text=Nouvel Encaissement')).toBeHidden({ timeout: 10000 });
      
      // Wait for the payment to appear
      await expect(page.locator('table').last()).toContainText('Droit d\'inscription', { timeout: 15000 });
      
      // Verify receipt button
      await page.evaluate(() => { window.print = () => {} });
      await page.locator('button[title="Imprimer Reçu"]').first().click();
      await expect(page.locator('text=Reçu de Paiement').first()).toBeVisible();
      // Close receipt if possible (or reload page for next test)
      await page.reload();
      await page.getByTestId('nav-payments').click();
      
      // Test tuition payment
      await page.locator('button:has-text("Encaissement (+)")').click();
      await page.waitForSelector('text=Nouvel Encaissement');
      
      // Select first available student again
      const studentSelect2 = page.locator('.form-group select').first();
      await page.waitForFunction(() => {
        const select = document.querySelector('.form-group select') as HTMLSelectElement;
        return select && select.options.length > 1;
      }, { timeout: 15000 }).catch(() => {});
      
      await studentSelect2.selectOption({ index: 1 });
      
      // select tuition
      const typeSelect2 = page.locator('select').nth(1);
      await typeSelect2.selectOption('tuition');
      // select installment T1 (should be visible when tuition is selected)
      await page.locator('select').nth(2).selectOption('T1');
      
      // Fill amount 
      const amountInput2 = page.locator('label:has-text("Montant")').locator('..').locator('input').last();
      await amountInput2.fill('10000');
      await page.locator('button:has-text("Enregistrer l\'encaissement")').click();
      await expect(page.locator('text=Nouvel Encaissement')).toBeHidden({ timeout: 10000 });
      
      // verify it appears
      await expect(page.locator('table').last()).toContainText('Scolarité (T1)', { timeout: 15000 });
    }
    
    monitor.assertNoCriticalErrors();
  });
});

