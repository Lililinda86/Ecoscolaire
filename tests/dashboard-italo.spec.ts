import { test, expect } from '@playwright/test';
import { attachConsoleMonitor } from './helpers/console-monitor';

import { loadStagingCredentials } from './helpers/stagingCredentials';

const { alphaPassword } = loadStagingCredentials(['alpha']);

test('Dashboard ITALO 2026-2027 is visible for owner', async ({ page }) => {
  const monitor = attachConsoleMonitor(page);

  await page.goto('/');
  await page.getByTestId('login-email').fill('owner.alpha@ecoscolaire.com');
  await page.getByTestId('login-password').fill(alphaPassword);
  await page.getByTestId('login-submit').click();

  // Attendre que le dashboard soit chargé
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });

  // Vérifier la présence de la section Pilotage ITALO
  await expect(page.locator('h2:has-text("Pilotage ITALO")')).toBeVisible();

  // Vérifier la présence des 4 cartes principales
  await expect(page.locator('h3:has-text("Inscriptions")')).toBeVisible();
  await expect(page.locator('h3:has-text("Paiements")')).toBeVisible();
  await expect(page.locator('h3:has-text("Transport")')).toBeVisible();
  await expect(page.locator('h3:has-text("Relances")')).toBeVisible();

  // Le tableau Actions Prioritaires peut ne pas être visible si aucun élève n'est en dette.
  // Ce test est purement en lecture seule et ne force aucune donnée. On s'assure juste de l'absence d'erreurs console.
  monitor.assertNoCriticalErrors();
});
