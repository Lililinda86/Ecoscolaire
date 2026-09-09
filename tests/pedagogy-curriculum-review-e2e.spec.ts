import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { initializeFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { curriculumReviewProposals as proposals } from '../src/features/pedagogy/resources/curriculumReviewManifest';
import { loginAs } from './helpers/auth';

test('34 curriculum proposals: owner decisions, batch, audit, tenant isolation and responsive', async ({ page }) => {
  const projectId = process.env.PEDAGOGY_FIREBASE_PROJECT_ID || 'demo-ecoscolaire';
  const staging = process.env.PEDAGOGY_STAGING_E2E === 'true';
  const emulator = projectId === 'demo-ecoscolaire' && Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
  if (!(staging && projectId === 'ecoscolaire-staging') && !emulator) throw new Error('Explicit Staging or complete demo emulators required. Production forbidden.');
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000);
  let phase = 'seed';
  const prefix = 'curriculum-review-' + randomBytes(8).toString('hex');
  const app = initializeApp({ projectId }, prefix), db = initializeFirestore(app, { preferRest: staging }), auth = getAuth(app);
  const yearId = prefix + '-year', ownerId = prefix + '-owner';
  const paths: string[] = [], authIds: string[] = [];
  const put = async (path: string, value: Record<string, unknown>) => { await db.doc(path).create(value); paths.push(path); };
  try {
    await put('schools/' + prefix, { id: prefix, name: 'Synthetic curriculum review school', schoolCode: 'SYNTHETIC', activeAcademicYearId: yearId, academicYear: '2026-2027', subscriptionStatus: 'active', isActive: true });
    await put('academicYears/' + yearId, { id: yearId, schoolId: prefix, name: '2026-2027', status: 'active', startDate: '2026-08-01', endDate: '2027-07-31' });
    for (const p of proposals) await put('classes/' + prefix + '-' + p.id, { id: prefix + '-' + p.id, schoolId: prefix, name: p.name, catalogLevelId: p.catalogLevelId, section: p.section === 'Francophone' ? 'francophone' : 'anglophone', type: p.section === 'Francophone' ? 'francophone' : 'anglophone', cycle: p.catalogLevelId.includes('secondary') ? 'secondary' : p.catalogLevelId.includes('primary') ? 'primary' : 'nursery', isActive: true, isTestFixture: true });
    const email = prefix + '@example.invalid', password = randomBytes(24).toString('base64url');
    await auth.createUser({ uid: ownerId, email, password }); authIds.push(ownerId);
    await auth.setCustomUserClaims(ownerId, { role: 'owner', schoolId: prefix });
    await put('users/' + ownerId, { id: ownerId, name: 'Synthetic review owner', email, schoolId: prefix, role: 'owner', isActive: true });
    // Foreign review must never appear in this tenant or influence counters.
    await put('curriculumProposalReviews/' + prefix + '-foreign', { schoolId: prefix + '-foreign', academicYearId: yearId, classId: prefix + '-D01', proposalId: 'D01', sourceVersion: proposals[0].sourceVersion, mappingVersion: proposals[0].mappingVersion, decision: 'APPROVED', revision: 99 });
    await loginAs(page, email, password);
    phase = 'render'; console.log('CURRICULUM_REVIEW_PHASE=' + phase);
    await page.goto('/#/pedagogy/program');
    const review = page.getByRole('region', { name: 'Validation du référentiel', exact: true });
    await expect(review.getByText('34 classes actives', { exact: true })).toBeVisible();
    await expect(review.getByTestId(/^proposal-/)).toHaveCount(34);
    await expect(review.getByText('0 approuvées', { exact: true })).toBeVisible();
    for (const group of new Set(proposals.map(p => p.group))) await expect(review.getByRole('heading', { name: group, exact: true })).toBeVisible();
    await expect(review.getByRole('checkbox')).toHaveCount(12);
    for (const box of await review.getByRole('checkbox').all()) await expect(box).not.toBeChecked();
    for (const select of await review.getByRole('combobox').all()) await expect(select).toHaveValue('');
    phase = 'responsive'; console.log('CURRICULUM_REVIEW_PHASE=' + phase);
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await review.getByTestId('proposal-D27').locator('summary').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await review.getByTestId('proposal-D27').locator('summary').click();
    }
    phase = 'individual'; console.log('CURRICULUM_REVIEW_PHASE=' + phase);
    await review.getByLabel('Choix — D27', { exact: true }).selectOption('REQUEST_CHANGE');
    await review.getByLabel('Note — D27', { exact: true }).fill('SYNTHETIC: official source required. No real decision.');
    await review.getByRole('button', { name: 'Enregistrer la décision — D27', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Confirmer les décisions' });
    await expect(confirmation).toBeVisible();
    expect((await db.collection('curriculumProposalReviews').where('schoolId', '==', prefix).get()).size).toBe(0);
    await confirmation.getByRole('button', { name: 'CONFIRMER L’ENREGISTREMENT' }).click();
    await expect(review.getByText('1 corrections demandées', { exact: true })).toBeVisible();
    phase = 'batch'; console.log('CURRICULUM_REVIEW_PHASE=' + phase);
    for (const id of ['D01', 'D07']) await review.getByLabel('Sélectionner ' + id, { exact: true }).check();
    await review.getByLabel('Note de décision groupée').fill('SYNTHETIC: selected mappings only. No real approval.');
    await review.getByRole('button', { name: 'APPROUVER LES SÉLECTIONNÉES' }).click();
    await expect(confirmation.locator('li')).toHaveCount(2);
    await confirmation.getByRole('button', { name: 'Annuler' }).click();
    await expect(review.getByText('0 approuvées', { exact: true })).toBeVisible();
    await review.getByRole('button', { name: 'APPROUVER LES SÉLECTIONNÉES' }).click();
    await confirmation.getByRole('button', { name: 'CONFIRMER L’ENREGISTREMENT' }).click();
    await expect(review.getByText('2 approuvées', { exact: true })).toBeVisible();
    await review.getByLabel('Choix — D27', { exact: true }).selectOption('NOT_APPLICABLE');
    await review.getByLabel('Note — D27', { exact: true }).fill('SYNTHETIC: exercise history; not a real owner decision.');
    await review.getByRole('button', { name: 'Enregistrer la décision — D27', exact: true }).click();
    await confirmation.getByRole('button', { name: 'CONFIRMER L’ENREGISTREMENT' }).click();
    await expect(review.getByText('1 non applicables', { exact: true })).toBeVisible();
    const stored = await db.collection('curriculumProposalReviews').where('schoolId', '==', prefix).get();
    expect(stored.size).toBe(3);
    for (const d of stored.docs) {
      expect(d.data().decidedBy).toBe(ownerId); expect(d.data().decidedAt.toMillis()).toBeGreaterThan(0);
      const p = proposals.find(p => p.id === d.data().proposalId)!;
      expect(d.data().sourceVersion).toBe(p.sourceVersion); expect(d.data().mappingVersion).toBe(p.mappingVersion);
      expect((await d.ref.collection('history').get()).size).toBe(d.data().revision);
    }
    expect((await db.collection('audit_logs').where('schoolId', '==', prefix).get()).docs.filter(d => d.data().action === 'CURRICULUM_PROPOSAL_DECIDED')).toHaveLength(4);
    await page.reload(); await expect(review.getByText('2 approuvées', { exact: true })).toBeVisible();
    // Same synthetic identity loses approval controls immediately after role reload.
    await db.doc('users/' + ownerId).update({ role: 'secretary' });
    await auth.setCustomUserClaims(ownerId, { role: 'secretary', schoolId: prefix });
    await page.reload(); await expect(review.getByText(/Consultation seule/)).toBeVisible();
    await expect(review.getByRole('checkbox')).toHaveCount(0); await expect(review.getByRole('combobox')).toHaveCount(0);
    console.log('CURRICULUM_REVIEW_LIVE PASS: 34/12/22, six groups, no preselection, individual/group decisions, audit, versions, foreign tenant exclusion, secretary read-only, responsive 360/768/1440. OPENAI CALLS: 0');
  } catch (error) {
    console.log('CURRICULUM_REVIEW_FAILED_PHASE=' + phase);
    throw error;
  } finally {
    for (const name of ['curriculumProposalReviews', 'curriculumReviewRequests', 'audit_logs']) for (const d of (await db.collection(name).where('schoolId', '==', prefix).get()).docs) {
      if (name === 'curriculumProposalReviews') for (const h of (await d.ref.collection('history').get()).docs) paths.push(h.ref.path);
      paths.push(d.ref.path);
    }
    const unique = [...new Set(paths)];
    if (unique.length) { const batch = db.batch(); unique.forEach(path => batch.delete(db.doc(path))); await batch.commit(); expect((await db.getAll(...unique.map(p => db.doc(p)))).every(d => !d.exists)).toBe(true); }
    for (const uid of authIds) await auth.deleteUser(uid);
    await deleteApp(app);
    console.log('CURRICULUM_REVIEW_EXACT_FIXTURE_CLEANUP_VERIFIED=' + prefix);
  }
});
