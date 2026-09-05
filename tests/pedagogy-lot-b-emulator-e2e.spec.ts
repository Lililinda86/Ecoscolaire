import { expect, test } from '@playwright/test';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { loginAs } from './helpers/auth';

const projectId = process.env.PEDAGOGY_FIREBASE_PROJECT_ID || 'demo-ecoscolaire';
const stagingRun = process.env.PEDAGOGY_STAGING_E2E === 'true';
if (stagingRun && projectId !== 'ecoscolaire-staging') throw new Error('PRODUCTION_GUARD: Lot B staging test requires ecoscolaire-staging.');
const fixture = {
  uid: 'pedagogy-lot-b-secretary', email: 'pedagogy.lot.b@emulator.test', password: 'Pedagogy-Lot-B-2026!',
  schoolId: 'pedagogy-lot-b-school', otherSchoolId: 'pedagogy-lot-b-school-other', yearId: 'pedagogy-lot-b-year',
  classId: 'pedagogy-lot-b-class', weekId: 'pedagogy-lot-b-week', planId: 'pedagogy-lot-b-plan', staffId: 'pedagogy-lot-b-teacher'
};
const scopedCollections = ['lessonPreparationTemplates', 'lessonPreparations', 'preparationUploads', 'preparationAnalyses', 'audit_logs'];
const protectedCollections = ['students', 'payments', 'expenses', 'grades', 'evaluations', 'buses', 'inventory'];

test.describe('Lot B — préparations de cours', () => {
  const emulatorRun = Boolean(process.env.FIRESTORE_EMULATOR_HOST) && Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) && Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
  test.skip(!emulatorRun && !stagingRun, 'Émulateurs complets ou Staging explicite obligatoires.');
  test.setTimeout(stagingRun ? 180_000 : 120_000);

  test('dérive, dépose, analyse, corrige, valide et nettoie sans régression Lot A', async ({ page }) => {
    const app = getApps().find(candidate => candidate.name === 'pedagogy-lot-b-e2e') || initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` }, 'pedagogy-lot-b-e2e');
    const firestore = getFirestore(app); const auth = getAuth(app); const bucket = getStorage(app).bucket();
    const countProtected = async () => Promise.all(protectedCollections.map(async name => (await firestore.collection(name).count().get()).data().count));
    const cleanup = async () => {
      for (const name of [...scopedCollections, 'teachingPlanItems', 'teachingPlans', 'teachingWeeks']) {
        const snapshot = await firestore.collection(name).where('schoolId', '==', fixture.schoolId).get();
        const batch = firestore.batch(); snapshot.docs.forEach(document => batch.delete(document.ref)); if (!snapshot.empty) await batch.commit();
      }
      const exact = [
        ['users', fixture.uid], ['schools', fixture.schoolId], ['schools', fixture.otherSchoolId], ['academicYears', fixture.yearId],
        ['classes', fixture.classId], ['staff', fixture.staffId], ['subjects', 'pedagogy-lot-b-math']
      ];
      const batch = firestore.batch(); exact.forEach(([name, id]) => batch.delete(firestore.collection(name).doc(id))); await batch.commit();
      try { await bucket.deleteFiles({ prefix: `schools/${fixture.schoolId}/pedagogy/preparations/` }); } catch (error) { if (!String(error).includes('404')) throw error; }
      try { await auth.deleteUser(fixture.uid); } catch (error) { if ((error as { code?: string }).code !== 'auth/user-not-found') throw error; }
    };
    await cleanup();
    try {
      await auth.createUser({ uid: fixture.uid, email: fixture.email, password: fixture.password, displayName: 'Secrétaire Lot B' });
      await auth.setCustomUserClaims(fixture.uid, { role: 'secretary', schoolId: fixture.schoolId });
      const batch = firestore.batch();
      const set = (name: string, id: string, data: Record<string, unknown>) => batch.set(firestore.collection(name).doc(id), { id, ...data });
      set('users', fixture.uid, { email: fixture.email, name: 'Secrétaire Lot B', role: 'secretary', schoolId: fixture.schoolId, isActive: true });
      set('schools', fixture.schoolId, { name: 'École Lot B', schoolCode: 'LOT-B', activeAcademicYearId: fixture.yearId, academicYear: '2026-2027', subscriptionStatus: 'active', isActive: true });
      set('schools', fixture.otherSchoolId, { name: 'École hors périmètre', subscriptionStatus: 'active', isActive: true });
      set('academicYears', fixture.yearId, { schoolId: fixture.schoolId, name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'active' });
      set('classes', fixture.classId, { schoolId: fixture.schoolId, name: 'CE1 Lot B', type: 'francophone', section: 'francophone', isActive: true });
      set('staff', fixture.staffId, { schoolId: fixture.schoolId, name: 'Mme Lot B', role: 'teacher', status: 'active', isActive: true });
      set('subjects', 'pedagogy-lot-b-math', { schoolId: fixture.schoolId, name: 'Mathématiques', isActive: true, createdAt: '2026-09-01', createdBy: fixture.uid, updatedAt: '2026-09-01', updatedBy: fixture.uid });
      set('teachingWeeks', fixture.weekId, { schoolId: fixture.schoolId, academicYearId: fixture.yearId, weekNumber: 1, weekStartDate: '2026-09-07', weekEndDate: '2026-09-11', status: 'open' });
      set('teachingPlans', fixture.planId, { schoolId: fixture.schoolId, academicYearId: fixture.yearId, classId: fixture.classId, weekId: fixture.weekId, weekNumber: 1, weekStartDate: '2026-09-07', weekEndDate: '2026-09-11', status: 'teacher_validated', version: 2 });
      for (const [suffix, slot, title] of [['pdf', 1, 'Comparer les nombres'], ['image', 2, 'Addition posée']] as const) set('teachingPlanItems', `${fixture.planId}__${suffix}`, {
        schoolId: fixture.schoolId, academicYearId: fixture.yearId, planId: fixture.planId, classId: fixture.classId,
        subjectId: 'pedagogy-lot-b-math', subjectName: 'Mathématiques', teacherStaffId: fixture.staffId,
        curriculumUnitId: `unit-${suffix}`, lessonTitle: title, objective: 'Résoudre une situation', dayIndex: 1, slotIndex: slot, status: 'teacher_validated'
      });
      set('lessonPreparations', 'cross-school-preparation', { schoolId: fixture.otherSchoolId, academicYearId: fixture.yearId, classId: 'other', weekStartDate: '2026-09-07', subjectName: 'Interdit', status: 'expected' });
      await batch.commit();

      const before = await countProtected();
      await loginAs(page, fixture.email, fixture.password);
      await page.goto('/#/pedagogy/preparations');
      await expect(page.getByRole('heading', { name: 'Préparations de cours' })).toBeVisible();
      await expect(page.getByText('Interdit')).toHaveCount(0);
      await page.getByRole('button', { name: 'Générer les préparations attendues' }).click();
      await expect(page.getByText(/2 préparation\(s\) attendue\(s\), 2 créée\(s\)/)).toBeVisible();
      await page.getByRole('button', { name: 'Générer les préparations attendues' }).click();
      await expect(page.getByText(/2 préparation\(s\) attendue\(s\), 0 créée\(s\)/)).toBeVisible();
      expect((await firestore.collection('lessonPreparations').where('schoolId', '==', fixture.schoolId).get()).size).toBe(2);
      expect((await firestore.collection('teachingPlans').doc(fixture.planId).get()).data()?.version).toBe(2);

      await page.getByRole('link', { name: 'Déposer' }).first().click();
      await page.locator('input[type=file]').setInputFiles({ name: 'preparation.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 Lot B') });
      await page.getByRole('button', { name: 'Déposer et analyser' }).click();
      await expect(page.getByText(/Analyse terminée/)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('heading', { name: 'Relecture structurée' })).toBeVisible();
      await page.getByLabel('Matériel').fill('Ardoise et craie');
      await page.getByRole('button', { name: 'Enregistrer les corrections' }).click();
      await expect(page.getByText('Corrections enregistrées.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Valider après relecture' })).toBeEnabled();
      await page.getByRole('button', { name: 'Valider après relecture' }).click();
      await expect(page.getByText('Préparation validée après relecture du secrétariat.')).toBeVisible();
      await page.reload();
      await expect(page.getByText(/Validée/).first()).toBeVisible();

      await page.goto('/#/pedagogy/preparations');
      const a4 = page.locator('#preparation-template');
      await expect(a4).toBeVisible();
      expect((await a4.boundingBox())?.width).toBeLessThanOrEqual(800);
      await page.getByRole('link', { name: 'Déposer' }).first().click();
      await page.locator('input[type=file]').setInputFiles({ name: 'analysis-fail.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) });
      await page.getByRole('button', { name: 'Déposer et analyser' }).click();
      await expect(page.getByText(/Analyse échouée/).first()).toBeVisible({ timeout: 20_000 });
      await page.getByLabel('Objectif').fill('Correction manuelle après échec');
      await page.getByRole('button', { name: 'Enregistrer les corrections' }).click();
      await expect(page.getByText('Corrections enregistrées.')).toBeVisible();

      await page.goto('/#/pedagogy/preparations/import');
      await page.getByText('Préparation manuelle non planifiée').click();
      await page.getByLabel('Matière').selectOption('pedagogy-lot-b-math');
      await page.getByLabel('Enseignant').selectOption(fixture.staffId);
      await page.getByLabel('Titre').fill('Séance imprévue');
      await page.getByLabel('Objectif').first().fill('Consolider');
      await page.locator('input[type=file]').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255, 216, 255]) });
      await page.getByRole('button', { name: 'Déposer et analyser' }).click();
      await expect(page.getByText(/Analyse terminée/)).toBeVisible({ timeout: 20_000 });
      expect((await firestore.collection('lessonPreparations').where('schoolId', '==', fixture.schoolId).where('source', '==', 'manual_unplanned').get()).size).toBe(1);
      expect(await countProtected()).toEqual(before);
      expect((await firestore.collection('audit_logs').where('schoolId', '==', fixture.schoolId).get()).size).toBeGreaterThanOrEqual(10);
    } finally {
      await firestore.collection('lessonPreparations').doc('cross-school-preparation').delete();
      await cleanup();
      const residuals = await Promise.all(scopedCollections.map(async name => (await firestore.collection(name).where('schoolId', '==', fixture.schoolId).get()).size));
      const [files] = await bucket.getFiles({ prefix: `schools/${fixture.schoolId}/pedagogy/preparations/` });
      expect(residuals.reduce((sum, value) => sum + value, files.length)).toBe(0);
      await deleteApp(app);
    }
  });
});
