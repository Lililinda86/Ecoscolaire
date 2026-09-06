import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { initializeFirestore } from 'firebase-admin/firestore';
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
  const app = initializeApp({ projectId }, prefix), db = initializeFirestore(app, { preferRest: staging }), auth = getAuth(app);
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
    await test.step('Verify canonical transfer without automatic grades', async () => {
      expect((await db.collection('evaluations').where('schoolId', '==', f.schoolId).get()).size).toBe(2);
      expect((await db.collection('grades').where('schoolId', '==', f.schoolId).get()).size).toBe(0);
    }, { timeout: 20_000 });
    console.log('LOT_D_PHASE: canonical transfer reads verified');
    await test.step('Wait for synthetic pupil results controls', async () => {
      await expect(page.getByRole('combobox', { name: 'Résultat Synthetic pupil 1', exact: true })).toBeVisible({ timeout: 20_000 });
    }, { timeout: 25_000 });
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
    await page.goto('/#/pedagogy/follow-up');
    await expect(page.getByRole('heading', { name: 'Suivi individuel et remédiation' })).toBeVisible();
    await page.getByText('Proposer une activité ciblée', { exact: true }).click();
    const zeroGrade = grades.find(grade => grade.studentId === f.pupilIds[0])!;
    await page.getByRole('combobox', { name: 'Preuve initiale', exact: true }).selectOption(`grade:${zeroGrade.id}`);
    await page.getByRole('textbox', { name: 'Activité proposée', exact: true }).fill('Synthetic support activity');
    await page.getByRole('textbox', { name: 'Motif contextualisé, sans diagnostic', exact: true }).fill('Synthetic contextual teacher support request');
    await expect(page.getByRole('combobox', { name: 'Élève suivi', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Enregistrer la proposition', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic support activity', exact: true })).toBeVisible();
    const support = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Synthetic support activity', exact: true }) });
    for (const button of ['Consigner l’accord enseignant', 'Consigner la réalisation']) {
      await support.getByRole('textbox', { name: 'Compte rendu reçu de l’enseignant', exact: true }).fill('Entirely synthetic received teacher declaration');
      await support.getByRole('combobox', { name: 'Enseignant déclarant', exact: true }).selectOption(f.teacherId);
      await support.getByRole('checkbox', { name: 'J’ai reçu cette déclaration de l’enseignant ; je ne la déduis pas des notes.' }).check();
      await support.getByRole('button', { name: button, exact: true }).click();
      await expect(support.getByRole('button', { name: button, exact: true })).toHaveCount(0);
    }
    const observationId = `${f.schoolId}-browser-reassessment`;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala' }).format(new Date());
    const observationPreparation = `${f.schoolId}-prep-${String(zeroGrade.subjectId).endsWith('-math') ? 'math' : 'english'}`;
    await db.doc(`pedagogyObservations/${observationId}`).create({ schoolId: f.schoolId, academicYearId: f.academicYearId, classId: f.classId, studentId: f.pupilIds[0], subjectId: zeroGrade.subjectId, preparationId: observationPreparation, date: today, state: 'developing', objective: 'Synthetic objective', objectiveId: 'synthetic-objective', comment: 'Entirely synthetic browser fixture', supersededBy: null });
    await page.reload();
    await support.getByRole('combobox', { name: 'Nouvelle preuve après réalisation', exact: true }).selectOption(`observation:${observationId}`);
    await support.getByRole('textbox', { name: 'Compte rendu reçu de l’enseignant', exact: true }).fill('Entirely synthetic follow-up declaration');
    await support.getByRole('combobox', { name: 'Enseignant déclarant', exact: true }).selectOption(f.teacherId);
    await support.getByRole('combobox', { name: 'Conclusion enseignante', exact: true }).selectOption('continue_support');
    await support.getByRole('checkbox', { name: 'J’ai reçu cette déclaration de l’enseignant ; je ne la déduis pas des notes.' }).check();
    await support.getByRole('button', { name: 'Consigner la réévaluation', exact: true }).click();
    await expect(support.getByText(/Réévaluation consignée/)).toBeVisible();
    const cases = await db.collection('pedagogyRemediations').where('schoolId', '==', f.schoolId).get();
    expect(cases.size).toBe(1); expect(cases.docs[0].data().review.outcome).toBe('continue_support');
    expect((await cases.docs[0].ref.collection('history').get()).size).toBe(4);
    await page.getByText('Rectifier cette observation sur déclaration reçue', { exact: true }).click();
    await page.getByRole('combobox', { name: 'État rectifié', exact: true }).selectOption('acquired');
    await page.getByRole('textbox', { name: 'Contexte corrigé et motif reçu', exact: true }).fill('Entirely synthetic correction received after reassessment');
    await page.getByRole('combobox', { name: 'Enseignant déclarant la rectification', exact: true }).selectOption(f.teacherId);
    await page.getByRole('checkbox', { name: 'J’ai reçu cette rectification de l’enseignant sélectionné.', exact: true }).check();
    await expect(page.getByRole('combobox', { name: 'Élève suivi', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Enregistrer la rectification reçue', exact: true }).click();
    await expect(page.getByText(/rectifiée, exclue des preuves courantes/)).toBeVisible();
    const prior = (await db.doc(`pedagogyObservations/${observationId}`).get()).data()!;
    expect(prior.state).toBe('developing'); expect(prior.supersededBy).toBeTruthy();
    const corrected = (await db.doc(`pedagogyObservations/${prior.supersededBy}`).get()).data()!;
    expect(corrected.state).toBe('acquired'); expect(corrected.supersedesId).toBe(observationId);
    expect(corrected.studentId).toBe(f.pupilIds[0]); expect(corrected.preparationId).toBe(observationPreparation);
    expect((await cases.docs[0].ref.get()).data()?.review).toEqual(cases.docs[0].data().review);
    for (const name of ['payments', 'expenses', 'cashClosures', 'buses', 'inventory']) expect((await db.collection(name).where('schoolId', '==', f.schoolId).get()).empty).toBe(true);
    console.log('LOT_D_BROWSER: canonical evaluation and grade writes expected and verified; no real pupil data or human approval');
  } finally {
    const cleanupErrors: unknown[] = [];
    try { await f.cleanup(); } catch (error) { cleanupErrors.push(error); }
    try { if (createdAuth) await auth.deleteUser(f.secretaryId); } catch (error) { cleanupErrors.push(error); }
    try { await deleteApp(app); } catch (error) { cleanupErrors.push(error); }
    expect(cleanupErrors, 'Synthetic fixture cleanup incomplete').toEqual([]);
  }
});
