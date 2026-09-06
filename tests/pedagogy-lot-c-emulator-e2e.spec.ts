import { expect, test } from '@playwright/test';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { loginAs } from './helpers/auth';

const projectId = process.env.PEDAGOGY_FIREBASE_PROJECT_ID || 'demo-ecoscolaire';
const stagingRun = process.env.PEDAGOGY_STAGING_E2E === 'true';
if (stagingRun && projectId !== 'ecoscolaire-staging') throw new Error('PRODUCTION_GUARD: Lot C staging requires ecoscolaire-staging.');
const f = { uid: 'pedagogy-lot-c-secretary', email: 'pedagogy.lot.c@emulator.test', password: 'Pedagogy-Lot-C-2026!', schoolId: 'pedagogy-lot-c-school', otherSchoolId: 'pedagogy-lot-c-other', yearId: 'pedagogy-lot-c-year', classId: 'pedagogy-lot-c-class', failClassId: 'pedagogy-lot-c-fail-class', weekId: 'pedagogy-lot-c-week', staffId: 'pedagogy-lot-c-teacher' };
const scoped = ['weeklyAssessments', 'assessmentItems', 'lessonPreparations', 'audit_logs'];
const protectedCollections = ['students', 'payments', 'expenses', 'grades', 'gradesStrict', 'evaluations', 'buses', 'inventory', 'cashClosures'];

test.describe('Lot C — évaluations hebdomadaires du vendredi', () => {
  const emulatorRun = Boolean(process.env.FIRESTORE_EMULATOR_HOST) && Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) && Boolean(process.env.FUNCTIONS_EMULATOR_HOST);
  test.skip(!emulatorRun && !stagingRun, 'Émulateurs complets ou staging explicite requis.');
  test.setTimeout(stagingRun ? 360_000 : 150_000);
  test('génère, relit, valide et imprime sans inventer ni modifier les domaines protégés', async ({ page }) => {
    const app = getApps().find(candidate => candidate.name === 'pedagogy-lot-c-e2e') || initializeApp({ projectId }, 'pedagogy-lot-c-e2e');
    const firestore = getFirestore(app); const auth = getAuth(app);
    const countProtected = async () => Promise.all(protectedCollections.map(async name => (await firestore.collection(name).count().get()).data().count));
    const cleanup = async () => {
      for (const name of scoped) {
        const snapshot = await firestore.collection(name).where('schoolId', '==', f.schoolId).get();
        const batch = firestore.batch(); snapshot.docs.forEach(document => batch.delete(document.ref)); if (!snapshot.empty) await batch.commit();
      }
      const exact = [['users', f.uid], ['schools', f.schoolId], ['schools', f.otherSchoolId], ['academicYears', f.yearId], ['classes', f.classId], ['classes', f.failClassId], ['staff', f.staffId], ['teachingWeeks', f.weekId], ['weeklyAssessments', 'cross-school-assessment'], ['assessmentItems', 'cross-school-item']];
      const batch = firestore.batch(); exact.forEach(([name, id]) => batch.delete(firestore.collection(name).doc(id))); await batch.commit();
      try { await auth.deleteUser(f.uid); } catch (error) { if ((error as { code?: string }).code !== 'auth/user-not-found') throw error; }
    };
    await cleanup();
    try {
      await auth.createUser({ uid: f.uid, email: f.email, password: f.password, displayName: 'Secrétaire Lot C' });
      await auth.setCustomUserClaims(f.uid, { role: 'secretary', schoolId: f.schoolId });
      const batch = firestore.batch();
      const set = (name: string, id: string, data: Record<string, unknown>) => batch.set(firestore.collection(name).doc(id), { id, ...data });
      set('users', f.uid, { email: f.email, name: 'Secrétaire Lot C', role: 'secretary', schoolId: f.schoolId, isActive: true });
      set('schools', f.schoolId, { name: 'École Lot C', schoolCode: 'LOT-C', activeAcademicYearId: f.yearId, academicYear: '2026-2027', subscriptionStatus: 'active', isActive: true });
      set('schools', f.otherSchoolId, { name: 'Autre école', subscriptionStatus: 'active', isActive: true });
      set('academicYears', f.yearId, { schoolId: f.schoolId, name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'active' });
      set('classes', f.classId, { schoolId: f.schoolId, name: 'CE1 Lot C', type: 'francophone', section: 'francophone', isActive: true });
      set('classes', f.failClassId, { schoolId: f.schoolId, name: '[generator-fail] CE2', type: 'francophone', section: 'francophone', isActive: true });
      set('staff', f.staffId, { schoolId: f.schoolId, name: 'Mme Validation', role: 'teacher', status: 'active', isActive: true });
      set('teachingWeeks', f.weekId, { schoolId: f.schoolId, academicYearId: f.yearId, weekNumber: 1, weekStartDate: '2026-09-07', weekEndDate: '2026-09-13', status: 'open' });
      const prep = (id: string, classId: string, subjectId: string, subjectName: string, status: string) => set('lessonPreparations', id, { schoolId: f.schoolId, academicYearId: f.yearId, classId, weekId: f.weekId, weekStartDate: '2026-09-07', weekEndDate: '2026-09-13', subjectId, classSubjectId: `${classId}-${subjectId}`, subjectName, teacherStaffId: f.staffId, curriculumUnitId: `unit-${subjectId}`, lessonTitle: `Leçon ${subjectName}`, objective: `Comprendre ${subjectName}`, status, analysisStatus: 'succeeded', version: 2, reviewData: status === 'validated' ? { lessonTitle: `Leçon ${subjectName}`, objective: `Comprendre ${subjectName}`, prerequisites: '', materials: '', lessonSteps: `Étapes ${subjectName}`, assessment: 'Question orale', differentiation: '' } : null });
      prep('lot-c-prep-math', f.classId, 'math', 'Mathématiques', 'validated'); prep('lot-c-prep-fr', f.classId, 'fr', 'Français', 'validated'); prep('lot-c-prep-science', f.classId, 'science', 'Sciences', 'expected'); prep('lot-c-prep-fail', f.failClassId, 'math', 'Mathématiques', 'validated');
      set('weeklyAssessments', 'cross-school-assessment', { schoolId: f.otherSchoolId, academicYearId: f.yearId, classId: 'other', weekId: f.weekId, title: 'Interdit', status: 'needs_review' });
      set('assessmentItems', 'cross-school-item', { schoolId: f.otherSchoolId, weeklyAssessmentId: 'cross-school-assessment', generationVersion: 1, questionText: 'Interdit', correctionGuide: 'Secret' });
      await batch.commit();
      const before = await countProtected();
      await page.addInitScript(() => { window.print = () => document.body.setAttribute('data-print-called', 'true'); });
      await loginAs(page, f.email, f.password);
      await page.goto('/#/pedagogy/assessments');
      await expect(page.getByRole('heading', { name: 'Évaluations du vendredi' })).toBeVisible();
      await expect(page.getByText('Sciences manquante')).toBeVisible(); await expect(page.getByText('Évaluation partielle')).toBeVisible(); await expect(page.getByText('Interdit')).toHaveCount(0);
      await page.getByRole('button', { name: 'Générer maintenant' }).click();
      await expect(page.getByText('Évaluation générée.')).toBeVisible({ timeout: 25_000 });
      await expect(page.getByText(/Version 1/)).toBeVisible(); await expect(page.getByText('20/20')).toBeVisible();
      await expect(page.getByText('BROUILLON — À VALIDER PAR L’ENSEIGNANT')).toBeVisible();
      const assessmentId = `${f.schoolId}__${f.yearId}__${f.classId}__${f.weekId}`;
      expect((await firestore.collection('weeklyAssessments').where('schoolId', '==', f.schoolId).where('classId', '==', f.classId).get()).size).toBe(1);
      expect((await firestore.collection('assessmentItems').where('weeklyAssessmentId', '==', assessmentId).get()).docs.every(document => document.data().subjectId !== 'science')).toBe(true);
      const question = page.getByLabel('Question').first(); await question.fill('Question corrigée après retour enseignant');
      await page.getByRole('button', { name: 'Enregistrer les corrections' }).click(); await expect(page.getByText('Corrections enregistrées à la demande de l’enseignant.')).toBeVisible();
      await page.getByLabel('Enseignant').selectOption(f.staffId); await page.getByLabel('Note').fill('Accord reçu sur papier.');
      await page.getByRole('button', { name: 'Enregistrer validation enseignant' }).click(); await expect(page.getByText('Validation de l’enseignant enregistrée par la secrétaire.')).toBeVisible();
      await page.getByRole('button', { name: 'Passer prête à imprimer' }).click(); await expect(page.getByText('Évaluation prête à imprimer.')).toBeVisible();
      await expect(page.getByText('BROUILLON — À VALIDER PAR L’ENSEIGNANT')).toHaveCount(0);
      await page.getByRole('button', { name: 'Imprimer version finale' }).click(); await expect(page.locator('body')).toHaveAttribute('data-print-called', 'true');
      await page.getByRole('button', { name: 'Corrigé / Guide de correction' }).click(); await expect(page.getByRole('heading', { name: 'CORRIGÉ / GUIDE DE CORRECTION' })).toBeVisible(); await expect(page.getByText('Réponse attendue').first()).toBeVisible();
      await page.reload(); await expect(page.getByText('Question corrigée après retour enseignant')).toBeVisible(); await expect(page.getByText('Validation de l’enseignant enregistrée par la secrétaire')).toBeVisible();
      await page.getByRole('button', { name: 'Générer maintenant' }).click(); await expect(page.getByText('Évaluation générée.')).toBeVisible();
      expect((await firestore.collection('weeklyAssessments').where('schoolId', '==', f.schoolId).where('classId', '==', f.classId).get()).size).toBe(1);
      expect((await firestore.collection('weeklyAssessments').doc(assessmentId).get()).data()?.generationVersion).toBe(1);
      await firestore.collection('lessonPreparations').doc('lot-c-prep-science').update({ status: 'validated', reviewData: { lessonTitle: 'Sciences', objective: 'Observer', lessonSteps: 'Expérience' }, version: 3 });
      await page.reload(); await expect(page.getByText('Une nouvelle préparation validée est disponible.')).toBeVisible(); await expect(page.getByText(/Version 1/)).toBeVisible();
      await page.getByLabel('Classe').selectOption(f.failClassId); await expect(page.getByText('1/1')).toBeVisible(); await page.getByRole('button', { name: 'Générer maintenant' }).click();
      await expect(page.getByText(/Génération impossible : MOCK_WEEKLY_ASSESSMENT_FAILURE/)).toBeVisible({ timeout: 25_000 }); await expect(page.getByText(/vous pouvez réessayer/i)).toBeVisible();
      expect(await countProtected()).toEqual(before);
      expect((await firestore.collection('audit_logs').where('schoolId', '==', f.schoolId).get()).size).toBeGreaterThanOrEqual(6);
    } finally {
      await cleanup();
      const residuals = await Promise.all(scoped.map(async name => (await firestore.collection(name).where('schoolId', '==', f.schoolId).get()).size));
      expect(residuals.reduce((sum, value) => sum + value, 0)).toBe(0);
      if (stagingRun) console.info('LOT_C_CLEANUP residuals=0 orphans=0');
      await deleteApp(app);
    }
  });
});
