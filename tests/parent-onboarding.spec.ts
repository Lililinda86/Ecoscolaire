import { test, expect } from '@playwright/test';

import { attachConsoleMonitor } from './helpers/console-monitor';

test.describe('Parent Onboarding P0-030', () => {
  test('La page ParentSignup affiche erreur si pas de inviteId', async ({ page }) => {
    const monitor = attachConsoleMonitor(page);
    await page.goto('/#/parent-signup');
    await expect(page.locator('text=Invitation Invalide')).toBeVisible();
    await expect(page.locator('text=Lien d\'invitation manquant.')).toBeVisible();
    monitor.assertNoCriticalErrors();
  });

  test('La page ParentSignup affiche erreur pour un faux inviteId', async ({ page }) => {
    // We expect a read error here as it's a fake ID
    const monitor = attachConsoleMonitor(page, {
      allowedConsoleErrors: [/Missing or insufficient permissions/i, /Erreur lors de la vérification de l'invitation/i, /Failed to load resource.*firestore/i, /FirebaseError.*Missing or insufficient permissions/i]
    });
    await page.goto('/#/parent-signup?inviteId=FAKE_ID_123');
    await expect(page.locator('text=Erreur lors de la lecture de l\'invitation. Veuillez réessayer.')).toBeVisible({ timeout: 10000 });
    monitor.assertNoCriticalErrors();
  });

  // Pour les tests plus complexes, il faudrait mocker Firestore.
  // Ces tests basiques vérifient que le routage et le composant sont montés et lisent l'URL.
});
