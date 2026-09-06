import { expect, test } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { loginAs } from './helpers/auth';
// Build the wire fixture independently; importing backend TS across its CommonJS
// package boundary prevents Playwright's ESM test discovery on Linux.
const reviewChecksum = (preparation: { currentUploadId: string; reviewData: Record<string, unknown> }) =>
  createHash('sha256').update(JSON.stringify({
    uploadId: preparation.currentUploadId,
    review: ['lessonTitle', 'objective', 'prerequisites', 'materials', 'lessonSteps', 'assessment', 'differentiation'].map(field => [field, preparation.reviewData[field] || null])
  })).digest('hex');

const projectId = process.env.PEDAGOGY_FIREBASE_PROJECT_ID || 'demo-ecoscolaire';
const stagingRun = process.env.PEDAGOGY_STAGING_E2E === 'true';
if (stagingRun && projectId !== 'ecoscolaire-staging') throw new Error('PRODUCTION_GUARD: Lot C staging requires ecoscolaire-staging.');
const runId = `lot-c-${randomBytes(8).toString('hex')}`;
const fixtureId = (name: string) => `${runId}-${name}`;
const f = { uid: fixtureId('secretary'), email: `${runId}@example.invalid`, password: randomBytes(24).toString('base64url'), schoolId: fixtureId('school'), otherSchoolId: fixtureId('other'), yearId: fixtureId('year'), classId: fixtureId('class'), failClassId: fixtureId('fail-class'), weekId: fixtureId('week'), staffId: fixtureId('teacher') };
const scoped = ['weeklyAssessments', 'assessmentItems', 'lessonPreparations', 'teacherAssignments', 'audit_logs'];
const protectedCollections = ['students', 'payments', 'expenses', 'grades', 'gradesStrict', 'evaluations', 'buses', 'inventory', 'cashClosures'];

test.describe('Lot C — évaluations hebdomadaires du vendredi', () => {
  const emulatorRun = projectId === 'demo-ecoscolaire' && Boolean(process.env.FIRESTORE_EMULATOR_HOST) && Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  if (process.env.CI && !stagingRun && !emulatorRun) throw new Error('CI emulator configuration missing; refusing a skipped success.');
  test.skip(!emulatorRun && !stagingRun, 'Émulateurs complets ou staging explicite requis.');
  test.setTimeout(stagingRun ? 360_000 : 150_000);
  test('génère, relit, valide et imprime sans inventer ni modifier les domaines protégés', async ({ page }) => {
    const app = getApps().find(candidate => candidate.name === 'pedagogy-lot-c-e2e') || initializeApp({ projectId }, 'pedagogy-lot-c-e2e');
    const firestore = getFirestore(app); const auth = getAuth(app);
    const countProtected = async () => Promise.all(protectedCollections.map(async name => (await firestore.collection(name).where('schoolId', '==', f.schoolId).count().get()).data().count));
    const cleanup = async () => {
      for (const name of scoped) {
        const snapshot = await firestore.collection(name).where('schoolId', '==', f.schoolId).get();
        if (name === 'weeklyAssessments') {
          for (const document of snapshot.docs) {
            for (const nested of ['revisions', 'contentRevisions', 'teacherDecisions']) {
              const revisions = await document.ref.collection(nested).get();
              const revisionsBatch = firestore.batch();
              revisions.docs.forEach(revision => revisionsBatch.delete(revision.ref));
              if (!revisions.empty) await revisionsBatch.commit();
              expect((await document.ref.collection(nested).get()).empty).toBe(true);
            }
          }
        }
        const batch = firestore.batch(); snapshot.docs.forEach(document => batch.delete(document.ref)); if (!snapshot.empty) await batch.commit();
      }
      const exact = [['users', f.uid], ['schools', f.schoolId], ['schools', f.otherSchoolId], ['academicYears', f.yearId], ['classes', f.classId], ['classes', f.failClassId], ['staff', f.staffId], ['teachingWeeks', f.weekId], ['weeklyAssessments', fixtureId('cross-school-assessment')], ['assessmentItems', fixtureId('cross-school-item')]];
      const batch = firestore.batch(); exact.forEach(([name, id]) => batch.delete(firestore.collection(name).doc(id))); await batch.commit();
      try { await auth.deleteUser(f.uid); } catch (error) { if ((error as { code?: string }).code !== 'auth/user-not-found') throw error; }
    };
    try {
      await auth.createUser({ uid: f.uid, email: f.email, password: f.password, displayName: 'Secrétaire Lot C' });
      await auth.setCustomUserClaims(f.uid, { role: 'secretary', schoolId: f.schoolId });
      const batch = firestore.batch();
      const set = (name: string, id: string, data: Record<string, unknown>) => batch.create(firestore.collection(name).doc(id), { id, ...data });
      set('users', f.uid, { email: f.email, name: 'Secrétaire Lot C', role: 'secretary', schoolId: f.schoolId, isActive: true });
      set('schools', f.schoolId, { name: 'École Lot C', schoolCode: 'LOT-C', activeAcademicYearId: f.yearId, academicYear: '2026-2027', subscriptionStatus: 'active', isActive: true });
      set('schools', f.otherSchoolId, { name: 'Autre école', subscriptionStatus: 'active', isActive: true });
      set('academicYears', f.yearId, { schoolId: f.schoolId, name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'active' });
      set('classes', f.classId, { schoolId: f.schoolId, name: 'CE1 Lot C', type: 'francophone', section: 'francophone', isActive: true });
      set('classes', f.failClassId, { schoolId: f.schoolId, name: '[generator-fail] CE2', type: 'francophone', section: 'francophone', isActive: true });
      set('staff', f.staffId, { schoolId: f.schoolId, name: 'Mme Validation', role: 'teacher', status: 'active', isActive: true });
      for (const subjectId of ['math', 'fr']) set('teacherAssignments', fixtureId(`assignment-${subjectId}`), { schoolId: f.schoolId, academicYearId: f.yearId, classId: f.classId, subjectId, teacherStaffId: f.staffId, status: 'active', isActive: true });
      set('teachingWeeks', f.weekId, { schoolId: f.schoolId, academicYearId: f.yearId, weekNumber: 1, weekStartDate: '2026-09-07', weekEndDate: '2026-09-13', status: 'open' });
      const confirmationFixture = (id: string, reviewData: Record<string, unknown>) => ({
        currentUploadId: `fixture-upload-${id}`, reviewData,
        teachingConfirmation: { id: `fixture-confirmation-${id}`, status: 'taught', effectiveDate: '2026-09-08', declaredByTeacherStaffId: f.staffId, recordedBy: f.uid, reviewChecksum: reviewChecksum({ currentUploadId: `fixture-upload-${id}`, reviewData }), excerpts: [], note: 'Synthetic test declaration, not a real teacher approval.' }
      });
      const prep = (id: string, classId: string, subjectId: string, subjectName: string, status: string) => set('lessonPreparations', fixtureId(id), {
        schoolId: f.schoolId, academicYearId: f.yearId, classId, weekId: f.weekId, weekStartDate: '2026-09-07', weekEndDate: '2026-09-13', subjectId,
        classSubjectId: `${classId}-${subjectId}`, subjectName, teacherStaffId: f.staffId, curriculumUnitId: `unit-${subjectId}`,
        lessonTitle: `Leçon ${subjectName}`, objective: `Comprendre ${subjectName}`, status, analysisStatus: 'succeeded', version: 2,
        ...(status === 'validated' ? confirmationFixture(id, { lessonTitle: `Leçon ${subjectName}`, objective: `Comprendre ${subjectName}`, prerequisites: '', materials: '', lessonSteps: `Étapes ${subjectName}`, assessment: 'Question orale', differentiation: '' }) : { reviewData: null })
      });
      prep('lot-c-prep-math', f.classId, 'math', 'Mathématiques', 'validated'); prep('lot-c-prep-fr', f.classId, 'fr', 'Français', 'validated'); prep('lot-c-prep-science', f.classId, 'science', 'Sciences', 'expected'); prep('lot-c-prep-fail', f.failClassId, 'math', 'Mathématiques', 'validated');
      set('weeklyAssessments', fixtureId('cross-school-assessment'), { schoolId: f.otherSchoolId, academicYearId: f.yearId, classId: 'other', weekId: f.weekId, title: 'Interdit', status: 'needs_review' });
      set('assessmentItems', fixtureId('cross-school-item'), { schoolId: f.otherSchoolId, weeklyAssessmentId: fixtureId('cross-school-assessment'), generationVersion: 1, questionText: 'Interdit', correctionGuide: 'Synthetic cross-tenant fixture' });
      await batch.commit();
      const before = await countProtected();
      await page.addInitScript(() => { window.print = () => document.body.setAttribute('data-print-called', 'true'); });
      console.log('[Lot C] setup: done');
      await loginAs(page, f.email, f.password);
      await page.goto('/#/pedagogy/assessments');
      await expect(page.getByRole('heading', { name: 'Évaluations du vendredi' })).toBeVisible();
      await expect(page.getByText('Sciences manquante')).toBeVisible(); await expect(page.getByText('Évaluation partielle')).toBeVisible(); await expect(page.getByText('Interdit')).toHaveCount(0);
      await page.getByRole('button', { name: 'Générer maintenant' }).click();
      console.log('[Lot C] coverage: partial confirmed');
      await expect(page.getByText('Évaluation générée.')).toBeVisible({ timeout: 25_000 });
      await expect(page.getByText(/^Version 1 ·/)).toBeVisible(); await expect(page.getByText('20/20', { exact: true })).toBeVisible();
      await expect(page.getByText('BROUILLON — À VALIDER PAR L’ENSEIGNANT')).toBeVisible();
      const assessmentId = `${f.schoolId}__${f.yearId}__${f.classId}__${f.weekId}`;
      console.log('[Lot C] generation: 20/20 draft confirmed');
      expect((await firestore.collection('weeklyAssessments').where('schoolId', '==', f.schoolId).where('classId', '==', f.classId).get()).size).toBe(1);
      expect((await firestore.collection('assessmentItems').where('weeklyAssessmentId', '==', assessmentId).get()).docs.every(document => document.data().subjectId !== 'science')).toBe(true);
      const question = page.getByLabel('Question').first(); await question.fill('Question corrigée après retour enseignant');
      await page.getByRole('button', { name: 'Enregistrer les corrections' }).click(); await expect(page.getByText('Corrections enregistrées à la demande de l’enseignant.')).toBeVisible();
      await page.getByRole('combobox', { name: /^Enseignant/ }).selectOption(f.staffId); await page.getByRole('textbox', { name: /^Note/ }).fill('Accord reçu sur papier.');
      await page.getByRole('checkbox', { name: 'Accord enseignant reçu pour cette version et ces matières' }).check();
      console.log('[Lot C] editing: saved');
      await page.getByRole('combobox', { name: 'Matière à valider' }).selectOption('math');
      await page.getByRole('checkbox', { name: 'Accord enseignant reçu pour cette version et ces matières' }).check();
      await page.getByRole('button', { name: 'Enregistrer validation enseignant' }).click();
      await expect(page.getByText('1/2 visa(s) par matière enregistrés pour cette version.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Passer prête à imprimer' })).toHaveCount(0);
      await page.getByRole('combobox', { name: 'Matière à valider' }).selectOption('fr');
      await page.getByRole('checkbox', { name: 'Accord enseignant reçu pour cette version et ces matières' }).check();
      await page.getByRole('button', { name: 'Enregistrer validation enseignant' }).click(); await expect(page.getByText('Validation de l’enseignant enregistrée par la secrétaire.')).toBeVisible();
      await page.getByRole('button', { name: 'Passer prête à imprimer' }).click(); await expect(page.getByText('Évaluation prête à imprimer.')).toBeVisible();
      console.log('[Lot C] teacher validation: recorded');
      await expect(page.getByText('BROUILLON — À VALIDER PAR L’ENSEIGNANT')).toHaveCount(0);
      await page.getByRole('button', { name: 'Imprimer version finale' }).click(); await expect(page.locator('body')).toHaveAttribute('data-print-called', 'true');
      console.log('[Lot C] final-print button invocation verified; rendered PDF not tested here');
      await page.getByRole('button', { name: 'Corrigé / Guide de correction' }).click(); await expect(page.getByRole('heading', { name: 'CORRIGÉ / GUIDE DE CORRECTION' })).toBeVisible(); await expect(page.getByText('Réponse attendue').first()).toBeVisible();
      console.log('[Lot C] correction guide: confirmed');
      await page.reload(); await expect(page.getByLabel('Question').first()).toHaveValue('Question corrigée après retour enseignant'); await expect(page.getByText('Validation de l’enseignant enregistrée par la secrétaire').first()).toBeVisible();
      console.log('[Lot C] reload: persisted');
      await page.getByRole('button', { name: 'Générer maintenant' }).click(); await expect(page.getByText('Évaluation générée.')).toBeVisible();
      expect((await firestore.collection('weeklyAssessments').where('schoolId', '==', f.schoolId).where('classId', '==', f.classId).get()).size).toBe(1);
      expect((await firestore.collection('weeklyAssessments').doc(assessmentId).get()).data()?.generationVersion).toBe(1);
      console.log('[Lot C] idempotence: confirmed');
      await firestore.collection('lessonPreparations').doc(fixtureId('lot-c-prep-science')).update({ status: 'validated', reviewData: { lessonTitle: 'Sciences', objective: 'Observer', lessonSteps: 'Expérience' }, version: 3 });
      await page.reload(); await expect(page.getByText('Les cours confirmés ont changé.')).toHaveCount(0);
      await expect(page.getByText('Sciences manquante')).toBeVisible();
      await firestore.collection('lessonPreparations').doc(fixtureId('lot-c-prep-science')).update({ ...confirmationFixture('lot-c-prep-science', { lessonTitle: 'Sciences', objective: 'Observer', lessonSteps: 'Expérience' }), version: 4 });
      await page.reload(); await expect(page.getByText('Les cours confirmés ont changé.')).toBeVisible(); await expect(page.getByText(/^Version 1 ·/)).toBeVisible();
      console.log('[Lot C] source change: detected');
      await page.getByRole('combobox', { name: /^Classe/ }).selectOption(f.failClassId); await expect(page.getByText('1/1', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Générer maintenant' }).click();
      await expect(page.getByText(/Génération impossible : MOCK_WEEKLY_ASSESSMENT_FAILURE/)).toBeVisible({ timeout: 25_000 }); await expect(page.getByText(/vous pouvez réessayer/i)).toBeVisible();
      expect(await countProtected()).toEqual(before);
      console.log('[Lot C] generator failure fallback: confirmed');
      expect((await firestore.collection('audit_logs').where('schoolId', '==', f.schoolId).get()).size).toBeGreaterThanOrEqual(6);
      console.log('[Lot C] protected collections: unchanged');
      console.log('[Lot C] audit trail: confirmed');
    } finally {
      console.log('[Lot C] fixture cleanup: starting');
      await cleanup();
      const residuals = await Promise.all(scoped.map(async name => (await firestore.collection(name).where('schoolId', '==', f.schoolId).get()).size));
      console.log('[Lot C] cleanup final: start');
      expect(residuals.reduce((sum, value) => sum + value, 0)).toBe(0);
      if (stagingRun) console.info('LOT_C_CLEANUP residuals=0 orphans=0');
      await deleteApp(app);
      console.log('[Lot C] cleanup final: done');
    }
  });
});
