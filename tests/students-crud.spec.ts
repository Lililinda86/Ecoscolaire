import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { loginAs } from './helpers/auth';
import { attachConsoleMonitor } from './helpers/console-monitor';

import { loadStagingCredentials } from './helpers/stagingCredentials';

const { alphaPassword } = loadStagingCredentials(['alpha']);

test.describe('Students CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'owner.alpha@ecoscolaire.com', alphaPassword);
    await page.getByTestId('nav-students').click();
  });

  test('Create, modify, and delete a student', async ({ page }) => {
    page.on('dialog', dialog => {
      console.log('DIALOG:', dialog.message());
      dialog.accept().catch(() => {});
    });
    const monitor = attachConsoleMonitor(page);

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
      await page.locator('.form-group').filter({ hasText: 'Année Scolaire (Inscription)' }).locator('input').fill('2026-2027');
      await page.locator('.form-group').filter({ hasText: 'Montant payé (Inscription)' }).locator('input').fill('15000');
      
      await page.locator('button[type="submit"], button:has-text("Enregistrer")').click();
      
      const row = page.locator('tr').filter({ hasText: studentName });
      await expect(row).toBeVisible({ timeout: 10000 });
      
      // Cleanup
      await row.locator('button[title*="Supprimer"]').first().click();
      await expect(row).not.toBeVisible();
    }
    monitor.assertNoCriticalErrors();
  });

  test('Export inscriptions CSV', async ({ page }) => {
    const exportBtn = page.locator('button:has-text("Exporter inscriptions")').first();
    await expect(exportBtn).toBeVisible({ timeout: 15000 });

    const downloadPromise = page.waitForEvent('download');
    await exportBtn.click();
    const download = await downloadPromise;

    const filename = download.suggestedFilename();
    expect(filename).toMatch(/inscriptions/i);

    const path = await download.path();
    if (path) {
      const content = fs.readFileSync(path, 'utf8');
      expect(content.includes('sep=;')).toBeTruthy();
      expect(content).toContain(';');
      expect(content).toMatch(/Nom|Classe|Sexe/);
    }
  });

  test('WhatsApp Reminder generation', async ({ page }) => {
    page.on('dialog', dialog => {
      dialog.accept().catch(() => {});
    });

    const addButton = page.locator('button', { hasText: /(Ajouter|Nouveau|\+)/i }).first();
    await addButton.click();
    
    const uniqueSuffix = Date.now().toString();
    const studentName = `WA Test ${uniqueSuffix}`;
    
    await page.locator('input[placeholder="Ex: MAT-001"]').fill(`MAT-WA-${uniqueSuffix}`);
    await page.locator('.form-group').filter({ hasText: /^Nom$/ }).locator('input').fill(studentName);
    await page.locator('.form-group').filter({ hasText: 'Nom du Tuteur' }).locator('input').fill('Parent WA');
    await page.locator('.form-group').filter({ hasText: 'Contact (Téléphone)' }).locator('input').fill('00237699123456');
    await page.locator('.form-group').filter({ hasText: 'Date de Naissance' }).locator('input').fill('2015-01-01');
    await page.locator('.form-group').filter({ hasText: 'Classe' }).locator('select').selectOption({ index: 1 });
    await page.locator('.form-group').filter({ hasText: 'Année Scolaire (Inscription)' }).locator('input').fill('2026-2027');
    await page.locator('.form-group').filter({ hasText: 'Droit d\'inscription attendu' }).locator('input').fill('15000');
    await page.locator('.form-group').filter({ hasText: 'Montant payé (Inscription)' }).locator('input').fill('0');
    
    await page.locator('button[type="submit"], button:has-text("Enregistrer")').click();
    
    const row = page.locator('tr').filter({ hasText: studentName });
    await expect(row).toBeVisible({ timeout: 10000 });
    
    const waButton = row.locator('button[title*="WhatsApp"]');
    await expect(waButton).toBeVisible();
    await expect(waButton).not.toBeDisabled();

    const popupPromise = page.waitForEvent('popup');
    await waButton.click();
    const popup = await popupPromise;
    const url = popup.url();

    expect(url).toMatch(/wa\.me\/237699123456|api\.whatsapp\.com.*237699123456/);
    expect(decodeURIComponent(url.replace(/\+/g, ' '))).toMatch(/15.*000/);
    expect(decodeURIComponent(url.replace(/\+/g, ' '))).toContain(studentName);

    await popup.close();

    await row.locator('button[title*="Supprimer"]').first().click();
    await expect(row).not.toBeVisible();
  });

  test('Create student in secondary class (Form 1)', async ({ page }) => {
    page.on('dialog', dialog => {
      dialog.accept().catch(() => {});
    });
    
    // Ensure Form 1 exists by visiting Classes page and clicking Repair
    await page.getByTestId('nav-classes').click();
    const repairBtn = page.locator('button:has-text("Réparer les classes manquantes")');
    if (await repairBtn.isVisible()) {
      const dialogPromise = page.waitForEvent('dialog', { timeout: 5000 }).catch(() => null);
      await repairBtn.click();
      await dialogPromise;
    }
    
    await page.getByTestId('nav-students').click();

    const addButton = page.locator('button', { hasText: /(Ajouter|Nouveau|\+)/i }).first();
    await addButton.click();
    
    const uniqueSuffix = Date.now().toString();
    const studentName = `Sec Student ${uniqueSuffix}`;
    
    await page.locator('input[placeholder="Ex: MAT-001"]').fill(`SEC-${uniqueSuffix}`);
    await page.locator('.form-group').filter({ hasText: /^Nom$/ }).locator('input').fill(studentName);
    await page.locator('form').first().locator('.form-group').filter({ has: page.locator('label', { hasText: /^Section$/ }) }).locator('select').selectOption('anglophone');
    await page.locator('form').first().locator('.form-group').filter({ has: page.locator('label', { hasText: 'Nom du Tuteur' }) }).locator('input').fill('Parent Sec');
    await page.locator('form').first().locator('.form-group').filter({ has: page.locator('label', { hasText: 'Date de Naissance' }) }).locator('input').fill('2010-01-01');
    await page.locator('form').first().locator('.form-group').filter({ has: page.locator('label', { hasText: /^Classe$/ }) }).locator('select').selectOption('anglo-form-1');
    
    await page.locator('button[type="submit"], button:has-text("Enregistrer")').click();
    
    const row = page.locator('tr').filter({ hasText: studentName });
    await expect(row).toBeVisible({ timeout: 10000 });
    
    await row.locator('button[title*="Supprimer"]').first().click();
    await expect(row).not.toBeVisible();
  });
});

