import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fixture from './helpers/pedagogy-results-fixture.cjs';
import { loginAs } from './helpers/auth';

const projectId = process.env.PEDAGOGY_FIREBASE_PROJECT_ID || 'demo-ecoscolaire';
const staging = process.env.PEDAGOGY_STAGING_E2E === 'true';
if (!['demo-ecoscolaire', 'ecoscolaire-staging'].includes(projectId) || staging && projectId !== 'ecoscolaire-staging') throw new Error('Production forbidden.');
test('Lot D: secretary transfers subject assessments and records received canonical results', async ({ page }) => {
  test.skip(!staging && !(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FUNCTIONS_EMULATOR_HOST), 'Full emulators or explicit Staging required.');
  test.setTimeout(180_000);
  const prefix = `pedagogy-results-${randomBytes(8).toString('hex')}`;
  const app = initializeApp({ projectId }, prefix), db = getFirestore(app), auth = getAuth(app);
  const f = await fixture.seedResultsFixture(db, prefix);
  let createdAuth = false;
  try {
    const email = `${prefix}@example.invalid`, password = randomBytes(24).toString('base64url');
    await auth.createUser({ uid: f.secretaryId, email, password }); createdAuth = true;
    await auth.setCustomUserClaims(f.secretaryId, { role: 'secretary', schoolId: f.schoolId });
    await loginAs(page, email, password);
    await page.goto('/#/pedagogy/results');
    await expect(page.getByRole('heading', { name: 'Résultats et suivi' })).toBeVisible();
    await expect(page.getByText('Synthetic weekly assessment · version 1, correction 0')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Confirmer le transfert de cette version pour la période sélectionnée' }).check();
    await page.getByRole('button', { name: 'Transférer vers la saisie des résultats' }).click();
    await expect(page.getByText(/Transfert enregistré : une évaluation canonique par matière/)).toBeVisible();
    expect((await db.collection('evaluations').where('schoolId', '==', f.schoolId).get()).size).toBe(2);
    expect((await db.collection('grades').where('schoolId', '==', f.schoolId).get()).size).toBe(0);
    await page.getByRole('combobox', { name: 'Résultat Synthetic pupil 1', exact: true }).selectOption('scored');
    await page.getByRole('spinbutton', { name: 'Score Synthetic pupil 1', exact: true }).fill('0');
    await page.getByRole('combobox', { name: 'Résultat Synthetic pupil 2', exact: true }).selectOption('absent');
    await page.getByRole('combobox', { name: 'Résultat Synthetic pupil 3', exact: true }).selectOption('notEvaluated');
    await page.getByRole('combobox', { name: 'Résultat Synthetic pupil 4', exact: true }).selectOption('notSubmitted');
    await expect(page.getByRole('combobox', { name: 'Classe', exact: true })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Correction de l’enseignant reçue ; je transcris uniquement les résultats indiqués' }).check();
    await page.getByRole('button', { name: 'Enregistrer les résultats reçus' }).click();
    await expect(page.getByText(/Résultats enregistrés dans le registre canonique/)).toBeVisible();
    const grades = (await db.collection('grades').where('schoolId', '==', f.schoolId).get()).docs.map(document => document.data());
    expect(grades).toHaveLength(4);
    expect(grades.find(grade => grade.studentId === f.pupilIds[0])?.score).toBe(0);
    expect(grades.filter(grade => grade.resultStatus !== 'scored').every(grade => grade.score === undefined)).toBe(true);
    expect(grades.some(grade => grade.studentId === f.pupilIds[4])).toBe(false);
    await page.reload();
    await expect(page.getByRole('spinbutton', { name: 'Score Synthetic pupil 1', exact: true })).toHaveValue('0');
    await expect(page.getByRole('combobox', { name: 'Résultat Synthetic pupil 3', exact: true })).toHaveValue('notEvaluated');
    for (const name of ['payments', 'expenses', 'cashClosures', 'buses', 'inventory']) expect((await db.collection(name).where('schoolId', '==', f.schoolId).get()).empty).toBe(true);
    console.log('LOT_D_BROWSER: canonical evaluation and grade writes expected and verified; no real pupil data or human approval');
  } finally {
    await f.cleanup();
    if (createdAuth) await auth.deleteUser(f.secretaryId);
    await deleteApp(app);
  }
});
