import { expect, test } from '@playwright/test';
import { collection, getCountFromServer } from 'firebase/firestore';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { loginAs } from './helpers/auth';

const emulatorOnly = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const secretaryEmail = process.env.E2E_SECRETARY_EMAIL || 'secretary.alpha@ecoscolaire.com';
const secretaryPassword = process.env.VITE_TEST_ALPHA_PASSWORD || process.env.TEST_ALPHA_PASSWORD || '';

test.describe('Lot A — parcours secrétaire', () => {
  test.skip(!emulatorOnly || !secretaryPassword, 'Ce parcours destructif est réservé à un émulateur préparé avec les fixtures staging.');

  test('proposition, ajustement, validation et historique sans écriture métier externe', async ({ page }) => {
    const env = await initializeTestEnvironment({ projectId: 'demo-ecoscolaire' });
    const protectedCollections = ['students', 'payments', 'expenses', 'buses'];
    const counts = () => env.withSecurityRulesDisabled(context =>
      Promise.all(protectedCollections.map(name => getCountFromServer(collection(context.firestore(), name)))));
    const before = await counts();

    await loginAs(page, secretaryEmail, secretaryPassword);
    await page.goto('/#/pedagogy');
    await expect(page.getByRole('heading', { name: 'Pilotage pédagogique' })).toBeVisible();
    await page.getByRole('link', { name: 'Planification' }).click();
    await page.getByLabel('Classe').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Initialiser les semaines' }).click();
    await expect(page.getByText('Semaines prêtes.')).toBeVisible();
    await page.getByLabel('Semaine').selectOption({ index: 1 });
    await page.getByRole('button', { name: /Créer la proposition|Regénérer la proposition/ }).click();
    await expect(page.getByText('Proposition générée.')).toBeVisible();
    const lesson = page.getByLabel(/^Leçon /).first();
    await lesson.fill(`${await lesson.inputValue()} — ajusté`);
    await page.getByRole('button', { name: 'Enregistrer les ajustements' }).click();
    await expect(page.getByText('Ajustements enregistrés.')).toBeVisible();
    await page.getByLabel('Enseignant ayant validé').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Consigner sa validation' }).click();
    await expect(page.getByText('Validation enseignant enregistrée.')).toBeVisible();
    await page.getByRole('link', { name: 'Historique' }).click();
    await expect(page.getByText('Validé par l’enseignant').first()).toBeVisible();

    const after = await counts();
    expect(after.map(item => item.data().count)).toEqual(before.map(item => item.data().count));
    await env.cleanup();
  });
});
