import { test, expect, type Locator } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { loginAs } from './helpers/auth';
import { fingerprint } from './helpers/maternelleTestSchoolReader';
import { getClassOptionLabel } from '../src/utils/classCatalog';

test('emulator authenticated seven-screen coverage includes configured Grades and nonzero fees', async ({ page, context }) => {
  // Refuse every remote credential and endpoint before any synthetic fixture write.
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
  assert.ok(!process.env.STAGING_TEST_ALPHA_PASSWORD && !process.env.STAGING_FIREBASE_SERVICE_ACCOUNT);
  const app = initializeApp({ projectId: 'demo-maternelle-pr201' }, 'maternelle-local-fixtures');
  const db = getFirestore(app);
  const schoolId = 'pr201-synthetic-school';
  const uid = 'pr201-synthetic-owner';
  const email = 'owner.pr201@emulator.test';
  const password = randomBytes(24).toString('hex');
  const yearId = 'pr201-synthetic-year';
  const classes = ['Maternelle 1', 'Petite Section', 'Maternelle 2', 'Moyenne Section', 'Maternelle 3', 'Grande Section', 'Pré-maternelle', 'SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'].map((name, index) => ({
    id: `pr201-class-${index}`, name, schoolId, type: 'francophone', cycle: index < 7 ? 'maternelle' : 'primaire', isActive: true,
  }));
  const classFees = Object.fromEntries(classes.map((item, index) => [item.name, { registration: 1000 + index, tuition: 60000 + index, t1: 20000 + index, t2: 20000, t3: 20000 }]));
  try {
    await getAuth(app).createUser({ uid, email, password });
    const batch = db.batch();
    const seed = (collection: string, id: string, data: Record<string, unknown>) => batch.create(db.collection(collection).doc(id), { id, ...data });
    seed('users', uid, { email, name: 'Propriétaire fictif', role: 'owner', schoolId, isActive: true });
    seed('schools', schoolId, { name: 'École fictive PR201', isActive: true, subscriptionStatus: 'active', subscriptionPlan: 'premium', activeAcademicYearId: yearId, academicYear: '2026-2027', classFees });
    seed('academicYears', yearId, { schoolId, name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'active' });
    seed('periods', 'pr201-period', { schoolId, academicYearId: yearId, name: 'Trimestre 1', type: 'term', order: 1, startDate: '2026-09-01', endDate: '2026-12-18', status: 'open' });
    for (const item of classes) seed('classes', item.id, item);
    seed('classPrograms', 'pr201-program', { schoolId, academicYearId: yearId, classId: classes[0].id, status: 'published', publishedRevisionId: 'pr201-revision', publishedRevisionNumber: 1 });
    seed('teacherAssignments', 'pr201-assignment', { schoolId, academicYearId: yearId, classId: classes[0].id, status: 'active', isActive: true, teacherStaffId: 'pr201-teacher', subjectId: 'pr201-subject' });
    await batch.commit();
    const snapshot = async () => {
      const collections = ['classes', 'students', 'payments', 'schools'];
      return fingerprint(await Promise.all(collections.map(async name => {
        const docs = await db.collection(name).get();
        return [name, docs.docs.map(doc => [doc.id, doc.data(), doc.updateTime.toMillis()]).sort()];
      })));
    };
    const before = await snapshot();
    const violations: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1') {
        if (url.hostname !== 'fonts.googleapis.com') violations.push('remote-request');
        return route.abort('blockedbyclient');
      }
      if (url.port === '5001') return route.abort('blockedbyclient');
      if (url.port === '8080' && /\/Write\/|:commit|:batchWrite/.test(request.url())) { violations.push('business-write'); return route.abort('blockedbyclient'); }
      return route.continue();
    });
    await loginAs(page, email, password);
    await expect(page.getByTestId('sidebar')).toBeVisible();
    const output = 'test-results/maternelle-synthetic-screens';
    await mkdir(output, { recursive: true });
    const navigate = async (route: string, title: RegExp) => { await page.goto(`/#/${route}`); await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible(); };
    const verify = async (locator: Locator, suffix = false) => {
      await expect(locator).toBeVisible();
      await expect.poll(() => locator.locator('option').count()).toBe(classes.length + 1);
      const options = await locator.locator('option').evaluateAll(items => items.filter(item => item.value && item.value !== 'all').map(item => ({ value: item.value, label: item.textContent?.trim() })));
      expect(options.map(item => item.value).sort()).toEqual(classes.map(item => item.id).sort());
      for (const item of classes) expect(options.find(option => option.value === item.id)?.label).toBe(getClassOptionLabel(item, classes) + (suffix ? ' (francophone)' : ''));
      expect(new Set(options.map(item => item.label)).size).toBe(classes.length);
    };
    const classSelect = () => page.locator('select').filter({ has: page.locator('option[value="pr201-class-0"]') });
    await navigate('settings', /^Paramètres$/);
    const feesCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Frais scolaires par classe', exact: true }) });
    await expect(feesCard.locator('tbody tr')).toHaveCount(classes.length);
    for (const item of classes) {
      const row = feesCard.getByRole('row').filter({ has: page.getByRole('cell', { name: getClassOptionLabel(item, classes), exact: true }) });
      const values = await row.locator('input').evaluateAll(inputs => inputs.map(input => input.value));
      expect(values).toEqual(Object.values(classFees[item.name]).map(String));
    }
    await feesCard.screenshot({ path: `${output}/01-Settings.png` });
    await navigate('classes', /^Classes/);
    await page.locator('button[aria-haspopup="listbox"]').click();
    const listbox = page.getByRole('listbox', { name: 'Classes disponibles' });
    await expect(listbox.getByRole('option')).toHaveCount(classes.length);
    await listbox.screenshot({ path: `${output}/02-Classes.png` });
    await navigate('students', /^Élèves$/); await verify(classSelect()); await page.screenshot({ path: `${output}/03-Students.png` });
    await navigate('attendance', /^Présences$/); await verify(classSelect()); await page.screenshot({ path: `${output}/04-Attendance.png` });
    await navigate('grades', /^Notes & Bulletins$/);
    await page.getByRole('button', { name: 'Saisir des Notes' }).click();
    await page.locator('select').filter({ has: page.locator('option[value="pr201-period"]') }).selectOption('pr201-period');
    await verify(classSelect(), true);
    await page.screenshot({ path: `${output}/05-Grades.png` });
    await navigate('report-cards', /^Bulletins scolaires$/); await verify(page.getByTestId('report-card-class')); await page.screenshot({ path: `${output}/06-ReportCards.png` });
    await navigate('pedagogy', /^Pilotage pédagogique$/);
    await navigate('pedagogy/planning', /^Planification hebdomadaire$/); await verify(page.getByRole('combobox', { name: 'Classe', exact: true })); await page.screenshot({ path: `${output}/07-Pedagogy.png` });
    expect(violations).toEqual([]); expect(errors).toEqual([]);
    expect(await snapshot()).toBe(before);
    console.log('MATERNELLE_EMULATOR_RESULT auth=PASS screens=7/7 gradesOptions=13/13 nonzeroFees=13/13 businessWritesAfterFixture=0 remoteRequests=0');
  } finally { await deleteApp(app); }
});
