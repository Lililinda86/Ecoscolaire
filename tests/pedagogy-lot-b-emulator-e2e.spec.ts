import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { loginAs } from './helpers/auth';

const projectId = process.env.PEDAGOGY_FIREBASE_PROJECT_ID || 'demo-ecoscolaire';
const stagingRun = process.env.PEDAGOGY_STAGING_E2E === 'true';
if (!['demo-ecoscolaire', 'ecoscolaire-staging'].includes(projectId)) throw new Error('PRODUCTION_GUARD: unexpected project.');
if (stagingRun && projectId !== 'ecoscolaire-staging') throw new Error('PRODUCTION_GUARD: Lot B staging test requires ecoscolaire-staging.');
const prefix = `ped-b-${randomBytes(8).toString('hex')}`;
const fixture = {
  uid: `${prefix}-secretary`, email: `${prefix}@example.invalid`, password: randomBytes(24).toString('base64url'),
  schoolId: `${prefix}-school`, otherSchoolId: `${prefix}-other`, yearId: `${prefix}-year`,
  classId: `${prefix}-class`, weekId: `${prefix}-week`, planId: `${prefix}-plan`, staffId: `${prefix}-teacher`,
  subjectId: `${prefix}-math`, crossPreparationId: `${prefix}-cross-preparation`
};
const scopedCollections = ['lessonPreparationTemplates', 'lessonPreparations', 'preparationUploads', 'preparationAnalyses', 'audit_logs'];
const protectedCollections = ['students', 'payments', 'expenses', 'grades', 'evaluations', 'buses', 'inventory'];

test.describe('Lot B — préparations de cours', () => {
  const emulatorRun = Boolean(process.env.FIRESTORE_EMULATOR_HOST) && Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) && Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
  test.skip(!emulatorRun && !stagingRun, 'Émulateurs complets ou Staging explicite obligatoires.');
  test.setTimeout(stagingRun ? 360_000 : 120_000);

  test('dérive, dépose, analyse, corrige, valide et nettoie sans régression Lot A', async ({ page }) => {
    const app = getApps().find(candidate => candidate.name === 'pedagogy-lot-b-e2e') || initializeApp({ projectId, storageBucket: stagingRun ? `${projectId}.firebasestorage.app` : `${projectId}.appspot.com` }, 'pedagogy-lot-b-e2e');
    const firestore = getFirestore(app); const auth = getAuth(app); const bucket = getStorage(app).bucket();
    const countProtected = async () => Promise.all(protectedCollections.map(async name => (await firestore.collection(name).where('schoolId', '==', fixture.schoolId).count().get()).data().count));
    let createdAuth = false, createdFixtures = false;
    const cleanup = async () => {
      if (stagingRun) console.info('[Lot B staging] cleanup: firestore start');
      if (createdFixtures) for (const name of [...scopedCollections, 'teachingPlanItems', 'teachingPlans', 'teachingWeeks']) {
        const snapshot = await firestore.collection(name).where('schoolId', '==', fixture.schoolId).get();
        const batch = firestore.batch(); snapshot.docs.forEach(document => batch.delete(document.ref)); if (!snapshot.empty) await batch.commit();
      }
      const exact = [
        ['users', fixture.uid], ['schools', fixture.schoolId], ['schools', fixture.otherSchoolId], ['academicYears', fixture.yearId],
        ['classes', fixture.classId], ['staff', fixture.staffId], ['subjects', fixture.subjectId], ['lessonPreparations', fixture.crossPreparationId]
      ];
      if (createdFixtures) { const batch = firestore.batch(); exact.forEach(([name, id]) => batch.delete(firestore.collection(name).doc(id))); await batch.commit(); }
      if (stagingRun) console.info('[Lot B staging] cleanup: firestore done; storage start');
      if (createdFixtures) { try { await bucket.deleteFiles({ prefix: `schools/${fixture.schoolId}/pedagogy/preparations/` }); } catch (error) { if (!String(error).includes('404')) throw error; } }
      if (stagingRun) console.info('[Lot B staging] cleanup: storage done; auth start');
      if (createdAuth) await auth.deleteUser(fixture.uid);
      if (stagingRun) console.info('[Lot B staging] cleanup: auth done');
    };
    try {
      if (stagingRun) console.info('[Lot B staging] setup: start');
      await auth.createUser({ uid: fixture.uid, email: fixture.email, password: fixture.password, displayName: 'Secrétaire Lot B' });
      createdAuth = true;
      await auth.setCustomUserClaims(fixture.uid, { role: 'secretary', schoolId: fixture.schoolId });
      const batch = firestore.batch();
      const set = (name: string, id: string, data: Record<string, unknown>) => batch.create(firestore.collection(name).doc(id), { id, ...data });
      set('users', fixture.uid, { email: fixture.email, name: 'Secrétaire Lot B', role: 'secretary', schoolId: fixture.schoolId, isActive: true });
      set('schools', fixture.schoolId, { name: 'École Lot B', schoolCode: 'LOT-B', activeAcademicYearId: fixture.yearId, academicYear: '2026-2027', subscriptionStatus: 'active', isActive: true });
      set('schools', fixture.otherSchoolId, { name: 'École hors périmètre', subscriptionStatus: 'active', isActive: true });
      set('academicYears', fixture.yearId, { schoolId: fixture.schoolId, name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'active' });
      set('classes', fixture.classId, { schoolId: fixture.schoolId, name: 'CE1 Lot B', type: 'francophone', section: 'francophone', isActive: true });
      set('staff', fixture.staffId, { schoolId: fixture.schoolId, name: 'Mme Lot B', role: 'teacher', status: 'active', isActive: true });
      set('subjects', fixture.subjectId, { schoolId: fixture.schoolId, name: 'Mathématiques', isActive: true, createdAt: '2026-09-01', createdBy: fixture.uid, updatedAt: '2026-09-01', updatedBy: fixture.uid });
      set('teachingWeeks', fixture.weekId, { schoolId: fixture.schoolId, academicYearId: fixture.yearId, weekNumber: 1, weekStartDate: '2026-09-07', weekEndDate: '2026-09-11', status: 'open' });
      set('teachingPlans', fixture.planId, { schoolId: fixture.schoolId, academicYearId: fixture.yearId, classId: fixture.classId, weekId: fixture.weekId, weekNumber: 1, weekStartDate: '2026-09-07', weekEndDate: '2026-09-11', status: 'teacher_validated', version: 2 });
      for (const [suffix, slot, title] of [['pdf', 1, 'Comparer les nombres'], ['image', 2, 'Addition posée']] as const) set('teachingPlanItems', `${fixture.planId}__${suffix}`, {
        schoolId: fixture.schoolId, academicYearId: fixture.yearId, planId: fixture.planId, classId: fixture.classId,
        subjectId: fixture.subjectId, subjectName: 'Mathématiques', teacherStaffId: fixture.staffId,
        curriculumUnitId: `unit-${suffix}`, lessonTitle: title, objective: 'Résoudre une situation', dayIndex: 1, slotIndex: slot, status: 'teacher_validated'
      });
      set('lessonPreparations', fixture.crossPreparationId, { schoolId: fixture.otherSchoolId, academicYearId: fixture.yearId, classId: 'other', weekStartDate: '2026-09-07', subjectName: 'Interdit', status: 'expected' });
      await batch.commit();
      createdFixtures = true;

      const before = await countProtected();
      if (stagingRun) console.info('[Lot B staging] setup: done; browser flow start');
      await loginAs(page, fixture.email, fixture.password);
      await page.goto('/#/pedagogy/resources');
      await expect(page.getByRole('heading', { name: 'Ressources pédagogiques', exact: true })).toBeVisible();
      await page.getByLabel('Langue', { exact: true }).selectOption('en');
      await page.getByLabel('Cycle', { exact: true }).selectOption('pre_nursery');
      await page.getByText('Explore and name familiar objects', { exact: true }).click();
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download draft text', exact: true }).click();
      const draftDownload = await downloadEvent;
      expect(draftDownload.suggestedFilename()).toBe('original-pre-en-v1.txt');
      const stream = await draftDownload.createReadStream();
      if (!stream) throw new Error('Synthetic resource download missing');
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const draftText = Buffer.concat(chunks).toString('utf8');
      expect(draftText).toContain('DRAFT - TEACHER REVIEW REQUIRED - NOT AN OFFICIAL CURRICULUM');
      expect(draftText).toContain('Continuous adult supervision');
      await draftDownload.delete();
      if (stagingRun) console.info('[Lot B staging] browser: login done');
      await page.goto('/#/pedagogy/preparations');
      await expect(page.getByRole('heading', { name: 'Préparations de cours' })).toBeVisible();
      await expect(page.getByText('Interdit')).toHaveCount(0);
      await page.getByRole('button', { name: 'Générer les préparations attendues' }).click();
      await expect(page.getByText(/2 préparation\(s\) attendue\(s\), 2 créée\(s\)/)).toBeVisible();
      if (stagingRun) console.info('[Lot B staging] browser: expected preparations created');
      await page.getByRole('button', { name: 'Générer les préparations attendues' }).click();
      await expect(page.getByText(/2 préparation\(s\) attendue\(s\), 0 créée\(s\)/)).toBeVisible();
      expect((await firestore.collection('lessonPreparations').where('schoolId', '==', fixture.schoolId).get()).size).toBe(2);
      expect((await firestore.collection('teachingPlans').doc(fixture.planId).get()).data()?.version).toBe(2);

      await page.getByRole('link', { name: 'Déposer' }).first().click();
      if (stagingRun) console.info('[Lot B staging] browser: PDF import opened');
      await page.locator('input[type=file]').setInputFiles({ name: 'preparation.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 Lot B') });
      await page.getByRole('button', { name: 'Déposer et analyser' }).click();
      await expect(page.getByText(stagingRun ? /Analyse échouée/ : /Analyse terminée/).first()).toBeVisible({ timeout: 20_000 });
      const initialAnalyses = await firestore.collection('preparationAnalyses').where('schoolId', '==', fixture.schoolId).get();
      expect(initialAnalyses.size).toBe(1);
      expect(initialAnalyses.docs[0].data().fileIntegrity?.size).toBe(Buffer.byteLength('%PDF-1.4 Lot B'));
      expect(initialAnalyses.docs[0].data().processingMode).toBe(stagingRun ? 'local_integrity_only' : 'demo_mock');
      if (stagingRun) expect(initialAnalyses.docs[0].data().errorCode).toBe('AI_DOCUMENT_PROCESSING_REQUIRES_APPROVAL');
      await expect(page.getByRole('heading', { name: 'Relecture structurée' })).toBeVisible();
      if (stagingRun) console.info('[Lot B staging] browser: PDF analysis done');
      await page.getByLabel('Matériel').fill('Ardoise et craie');
      await page.getByRole('button', { name: 'Enregistrer les corrections' }).click();
      await expect(page.getByText('Corrections enregistrées.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Valider après relecture' })).toBeEnabled();
      await page.getByRole('button', { name: 'Valider après relecture' }).click();
      await expect(page.getByText('Préparation validée après relecture du secrétariat.')).toBeVisible();
      await page.reload();
      await expect(page.getByText(/Validée/).first()).toBeVisible();
      if (stagingRun) console.info('[Lot B staging] browser: review and reload done');

      await page.goto('/#/pedagogy/preparations');
      const a4 = page.locator('#preparation-template');
      await expect(a4).toBeVisible();
      expect((await a4.boundingBox())?.width).toBeLessThanOrEqual(800);
      await page.getByRole('link', { name: 'Déposer' }).first().click();
      await page.locator('input[type=file]').setInputFiles({ name: 'analysis-fail.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) });
      await page.getByRole('button', { name: 'Déposer et analyser' }).click();
      await expect(page.getByText(/Analyse échouée/).first()).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: 'Reprendre le contrôle du même fichier', exact: true }).click();
      await expect(page.getByText(/Analyse indisponible/).first()).toBeVisible();
      const failedAnalyses = (await firestore.collection('preparationAnalyses').where('schoolId', '==', fixture.schoolId).get()).docs.filter(item => item.data().errorCode === 'UPLOAD_SIGNATURE_MISMATCH');
      expect(failedAnalyses).toHaveLength(2);
      expect(failedAnalyses.map(item => item.data().attempt).sort()).toEqual([1, 2]);
      await page.getByLabel('Objectif').fill('Correction manuelle après échec');
      await page.getByRole('button', { name: 'Enregistrer les corrections' }).click();
      await expect(page.getByText('Corrections enregistrées.')).toBeVisible();
      if (stagingRun) console.info('[Lot B staging] browser: failure fallback done');

      await page.goto('/#/pedagogy/preparations/import');
      await page.getByText('Préparation manuelle non planifiée').click();
      await page.getByLabel('Matière').selectOption(fixture.subjectId);
      await page.getByLabel('Enseignant').selectOption(fixture.staffId);
      await page.getByLabel('Titre').fill('Séance imprévue');
      await page.getByLabel('Objectif').first().fill('Consolider');
      await page.locator('input[type=file]').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255, 216, 255]) });
      await page.getByRole('button', { name: 'Déposer et analyser' }).click();
      await expect(page.getByText(stagingRun ? /Analyse échouée/ : /Analyse terminée/).first()).toBeVisible({ timeout: 20_000 });
      if (stagingRun) console.info('[Lot B staging] browser: manual preparation done');
      expect((await firestore.collection('lessonPreparations').where('schoolId', '==', fixture.schoolId).where('source', '==', 'manual_unplanned').get()).size).toBe(1);
      expect(await countProtected()).toEqual(before);
      expect((await firestore.collection('audit_logs').where('schoolId', '==', fixture.schoolId).get()).size).toBeGreaterThanOrEqual(10);
      if (stagingRun) console.info('[Lot B staging] browser flow: done');
    } finally {
      if (stagingRun) console.info('[Lot B staging] final cleanup: start');
      await cleanup();
      const residuals = await Promise.all(scopedCollections.map(async name => (await firestore.collection(name).where('schoolId', '==', fixture.schoolId).get()).size));
      const [files] = await bucket.getFiles({ prefix: `schools/${fixture.schoolId}/pedagogy/preparations/` });
      expect(residuals.reduce((sum, value) => sum + value, files.length)).toBe(0);
      if (stagingRun) console.info('[Lot B staging] final cleanup: verified');
      await deleteApp(app);
    }
  });
});
