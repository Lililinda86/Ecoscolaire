import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { initializeFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { curriculumReviewProposals } from '../src/features/pedagogy/resources/curriculumReviewManifest';
import { loginAs } from './helpers/auth';

const routes = [
  ['', 'Pilotage pédagogique'], ['program', 'Programme de référence'],
  ['planning', 'Planification hebdomadaire'], ['preparations', 'Préparations de cours'],
  ['preparations/import', 'Importer et relire'], ['preparations/missing', 'Préparations manquantes'],
  ['assessments', 'Évaluations du vendredi'], ['history', 'Historique des planifications'],
  ['resources', 'Ressources pédagogiques'], ['exam-bank', 'Banque d’épreuves internes'],
  ['results', 'Résultats et suivi'], ['follow-up', 'Suivi individuel et remédiation'],
  ['observations', 'Activités et observations'], ['settings', 'Paramètres pédagogiques'],
] as const;

test('secretary: all pedagogy routes, responsive empty states and documentary details without provider calls', async ({ page }, testInfo) => {
  const projectId = process.env.PEDAGOGY_FIREBASE_PROJECT_ID || 'demo-ecoscolaire';
  const staging = process.env.PEDAGOGY_STAGING_E2E === 'true';
  const emulator = projectId === 'demo-ecoscolaire' && Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
  if (!(staging && projectId === 'ecoscolaire-staging') && !emulator) throw new Error('Explicit Staging or demo emulators required. Production forbidden.');
  if (staging) expect(new URL(process.env.STAGING_APP_URL || '').hostname).toMatch(/^ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/);
  test.setTimeout(300_000);
  const prefix = 'pedagogy-inventory-' + randomBytes(8).toString('hex');
  const app = initializeApp({ projectId }, prefix), db = initializeFirestore(app, { preferRest: staging }), auth = getAuth(app);
  const yearId = prefix + '-year', uid = prefix + '-secretary';
  const paths: string[] = [], providerAttempts: string[] = [], browserErrors: string[] = [];
  let authCreated = false;
  const inventory: Array<{ route: string; title: string; widths: number[]; status: string }> = [];
  const put = async (path: string, value: Record<string, unknown>) => {
    await db.doc(path).create({ ...value, syntheticFixture: prefix }); paths.push(path);
  };
  page.on('pageerror', error => browserErrors.push(error.name));
  // Fail closed if navigation ever attempts a generation or document-analysis call.
  await page.route(/\/(?:generateWeeklyAssessment|startLessonPreparationAnalysis|pedagogySyntheticAiGateway)(?:\?|$)/, async route => {
    providerAttempts.push(new URL(route.request().url()).pathname); await route.abort();
  });
  try {
    await put('schools/' + prefix, { id: prefix, name: 'Synthetic secretary inventory', schoolCode: 'SYNTHETIC', activeAcademicYearId: yearId, academicYear: '2026-2027', subscriptionStatus: 'active', isActive: true });
    await put('academicYears/' + yearId, { id: yearId, schoolId: prefix, name: '2026-2027', status: 'active', startDate: '2026-08-01', endDate: '2027-07-31' });
    for (const p of curriculumReviewProposals) await put('classes/' + prefix + '-' + p.id, {
      id: prefix + '-' + p.id, schoolId: prefix, name: p.name, catalogLevelId: p.catalogLevelId,
      section: p.section === 'Francophone' ? 'francophone' : 'anglophone',
      type: p.section === 'Francophone' ? 'francophone' : 'anglophone',
      cycle: p.catalogLevelId.includes('secondary') ? 'secondary' : p.catalogLevelId.includes('primary') ? 'primary' : 'nursery', isActive: true, isTestFixture: true,
    });
    const email = prefix + '@example.invalid', password = randomBytes(24).toString('base64url');
    await auth.createUser({ uid, email, password }); authCreated = true;
    await auth.setCustomUserClaims(uid, { role: 'secretary', schoolId: prefix });
    await put('users/' + uid, { id: uid, name: 'Synthetic secretary', email, role: 'secretary', schoolId: prefix, isActive: true });
    await loginAs(page, email, password);
    for (const [route, title] of routes) {
      await page.goto('/#/pedagogy' + (route ? '/' + route : ''));
      const main = page.locator('.pedagogy-page');
      await expect(main.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(main.locator('[aria-busy="true"]')).toHaveCount(0);
      await expect(main.locator('.pedagogy-alert--error')).toHaveCount(0);
      const widths = [360, 768, 1440];
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`inventory-${route.replaceAll('/', '-') || 'overview'}-${width}.png`), fullPage: false });
      }
      inventory.push({ route: '/pedagogy' + (route ? '/' + route : ''), title, widths, status: 'RENDER_PASS_SYNTHETIC_EMPTY_WORKFLOW' });
    }
    await page.goto('/#/pedagogy/resources');
    const library = page.getByTestId('material-library');
    await expect(library).toBeVisible();
    await library.getByRole('combobox', { name: 'Niveau documentaire', exact: true }).selectOption('en-secondary-form5');
    await library.getByRole('combobox', { name: 'Source documentaire', exact: true }).selectOption('MINESEC');
    const module = library.locator('details').filter({ has: page.locator('section[aria-label="Modules documentaires structurés"]') }).first();
    await module.locator(':scope > summary').click();
    await expect(module.getByRole('region', { name: 'Modules documentaires structurés' })).toBeVisible();
    await module.getByText('Form 5 · Data and probability', { exact: true }).click();
    await expect(module.getByText('Compétence visée — résumé documentaire : Organise data, interpret results and justify probabilistic conclusions.', { exact: true })).toBeVisible();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
    expect(providerAttempts).toEqual([]); expect(browserErrors).toEqual([]);
    for (const collection of ['teachingPlans', 'lessonPreparations', 'weeklyAssessments', 'schoolCurriculumAdoptions', 'pedagogyAiOperations']) {
      expect((await db.collection(collection).where('schoolId', '==', prefix).get()).empty).toBe(true);
    }
    console.log('PEDAGOGY_ROUTE_INVENTORY_PASS routes=14 widths=360,768,1440 providerCalls=0 workflowData=synthetic-empty');
  } finally {
    // Delete only documents created by this test, never another task’s fixtures.
    const docs = paths.length ? await db.getAll(...paths.map(path => db.doc(path))) : [];
    for (const doc of docs) if (doc.exists) expect(doc.data()?.syntheticFixture).toBe(prefix);
    for (const audit of (await db.collection('audit_logs').where('schoolId', '==', prefix).get()).docs) paths.push(audit.ref.path);
    if (paths.length) { const batch = db.batch(); paths.forEach(path => batch.delete(db.doc(path))); await batch.commit(); }
    if (authCreated) await auth.deleteUser(uid);
    const cleanup = paths.length ? (await db.getAll(...paths.map(path => db.doc(path)))).every(doc => !doc.exists) : true;
    expect(cleanup).toBe(true);
    await writeFile(testInfo.outputPath('module-inventory.json'), JSON.stringify({ projectId, sha: process.env.GITHUB_SHA || null, inventory, providerAttempts, browserErrors, cleanup, workflowValidation: 'Separate functional suites required; route rendering alone is not end-to-end workflow success.' }, null, 2));
    await deleteApp(app);
  }
});
