import { test, expect } from '@playwright/test';
import { attachConsoleMonitor } from './helpers/console-monitor';

test.describe('BoardViewer UI Restrictions', () => {
  test('BoardViewer sees read-only UI and no write buttons', async ({ page }) => {
    page.on('console', msg => console.log(`BROWSER CONSOLE: ${msg.type()}: ${msg.text()}`));
    const monitor = attachConsoleMonitor(page);
    
    await page.goto('/');
    const isEmulator = await page.evaluate(() => (window as unknown as { __auth_emulator_connected__?: boolean }).__auth_emulator_connected__);
    console.log('Emulator connected:', isEmulator);
    await page.getByTestId('login-email').fill('boardviewer.alpha@ecoscolaire.com');
    await page.getByTestId('login-password').fill('Test@2026Alpha!');
    await page.getByTestId('login-submit').click();

    // Check banner directly
    await page.waitForTimeout(5000); // Wait enough for AppContext
    console.log("=== URL ===", page.url());
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log("=== BODY TEXT START ===\n" + bodyText + "\n=== BODY TEXT END ===");
    
    // Check if the banner exists in DOM, maybe it's just hidden?
    const bannerCount = await page.locator('text=Accès en consultation uniquement').count();
    console.log("=== BANNER COUNT ===", bannerCount);
    
    await expect(page.locator('text=Accès en consultation uniquement')).toBeVisible({ timeout: 5000 });

    // Students
    await page.goto('/#/students');
    await expect(page.locator('h1:has-text("Élèves")')).toBeVisible();
    await expect(page.locator('button:has-text("Ajouter")')).not.toBeVisible();

    // Classes
    await page.goto('/#/classes');
    await expect(page.locator('h1:has-text("Classes")')).toBeVisible();
    await expect(page.locator('button:has-text("Ajouter")')).not.toBeVisible();

    // Subjects
    await page.goto('/#/subjects-program');
    await expect(page.locator('button:has-text("Ajouter")')).not.toBeVisible();

    // Grades
    await page.goto('/#/grades');
    await expect(page.locator('button:has-text("Ajouter")')).not.toBeVisible();

    // Attendance
    await page.goto('/#/attendance');
    await expect(page.locator('button:has-text("Enregistrer")')).not.toBeVisible();

    // Staff
    await page.goto('/#/staff');
    await expect(page.locator('h1:has-text("Personnel")')).toBeVisible();
    await expect(page.locator('button:has-text("Ajouter")')).not.toBeVisible();
    await expect(page.locator('button:has-text("Désactiver")')).not.toBeVisible();

    // Buses
    await page.goto('/#/buses');
    await expect(page.locator('button:has-text("Ajouter")')).not.toBeVisible();

    // Inventory
    await page.goto('/#/inventory');
    await expect(page.locator('button:has-text("Ajouter")')).not.toBeVisible();

    // Payments
    await page.goto('/#/payments');
    await expect(page.locator('button:has-text("Encaissement (+)")')).not.toBeVisible();
    await expect(page.locator('button:has-text("Dépense (-)")')).not.toBeVisible();

    // Validation
    await page.goto('/#/validation-dashboard');
    await expect(page.locator('button:has-text("Approuver")')).not.toBeVisible();
    await expect(page.locator('button:has-text("Refuser")')).not.toBeVisible();

    // Check Settings inaccessible
    await page.goto('/#/settings');
    await expect(page.locator('text=Accès refusé')).toBeVisible();

    monitor.assertNoCriticalErrors();
  });
});
