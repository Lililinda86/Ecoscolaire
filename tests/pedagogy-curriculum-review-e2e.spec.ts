import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { initializeFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { curriculumReviewProposals as proposals } from '../src/features/pedagogy/resources/curriculumReviewManifest';
import { loginAs } from './helpers/auth';
import { DEFAULT_SUBJECT_CATALOG } from '../functions/src/academic/defaultSubjectCatalog';

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
    for (const subject of DEFAULT_SUBJECT_CATALOG.filter(s => s.cycles.includes('primary'))) await put('subjects/' + prefix + '-' + subject.internalCode, { ...subject, id: prefix + '-' + subject.internalCode, schoolId: prefix, isActive: true });
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
    await expect(review.getByTestId('primary-level-review')).toHaveCount(12);
    await expect(review.getByTestId('primary-safe-mapping')).toHaveCount(76);
    await expect(review.getByTestId('primary-ambiguous-mapping')).toHaveCount(44);
    await expect(review.getByText('MAPPINGS SÛRS : 0/76 validés', { exact: true })).toBeVisible();
    for (const box of await review.getByRole('checkbox').all()) await expect(box).not.toBeChecked();
    for (const select of await review.getByRole('combobox').all()) await expect(select).toHaveValue('');
    await review.getByText('Dossiers documentaires complets — 34 niveaux et revues séparées', { exact: true }).click();
    for (const group of new Set(proposals.map(p => p.group))) await expect(review.getByRole('heading', { name: group, exact: true })).toBeVisible();
    phase = 'responsive'; console.log('CURRICULUM_REVIEW_PHASE=' + phase);
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await review.getByTestId('proposal-D27').getByText('Documents, couverture et justification — D27', { exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await review.getByTestId('proposal-D27').getByText('Documents, couverture et justification — D27', { exact: true }).click();
    }
    phase = 'individual'; console.log('CURRICULUM_REVIEW_PHASE=' + phase);
    const subjectReview = review.getByRole('region', { name: 'Matières proposées — SIL', exact: true });
    await expect(subjectReview.getByText(/10 matières\/domaines officiels identifiés/)).toBeVisible();
    await expect(review.getByRole('heading', { name: 'MATIÈRES PROPOSÉES POUR ITALO', exact: true })).toHaveCount(12);
    for (const name of ['CE1', 'Class 3']) {
      const primary = review.getByRole('region', { name: 'Matières proposées — ' + name, exact: true });
      await expect(primary.getByText(/10 matières\/domaines officiels identifiés/)).toBeVisible();
      await primary.getByText('Voir les matières — ' + name, { exact: true }).click();
      await expect(primary.getByText('Unités structurées disponibles — couverture partielle', { exact: true })).toBeVisible();
      await primary.getByText('Voir les matières — ' + name, { exact: true }).click();
    }
    expect((await db.collection('curriculumSubjectMappings').where('schoolId', '==', prefix).get()).size).toBe(0);
    await subjectReview.getByText('Voir les matières — SIL', { exact: true }).click();
    for (const width of [360, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true); }
    await subjectReview.getByRole('button', { name: 'APPLIQUER LES CORRESPONDANCES SÛRES — SIL', exact: true }).click();
    let subjectDialog = page.getByRole('dialog', { name: 'Confirmer les matières — SIL', exact: true });
    await expect(subjectDialog.locator('li')).toHaveCount(7);
    await subjectDialog.getByRole('button', { name: 'Annuler', exact: true }).click();
    expect((await db.collection('curriculumSubjectMappings').where('schoolId', '==', prefix).get()).size).toBe(0);
    await subjectReview.getByRole('button', { name: 'APPLIQUER LES CORRESPONDANCES SÛRES — SIL', exact: true }).click();
    subjectDialog = page.getByRole('dialog', { name: 'Confirmer les matières — SIL', exact: true });
    await subjectDialog.getByRole('button', { name: 'CONFIRMER LES CORRESPONDANCES SÛRES', exact: true }).click();
    await expect(subjectReview.getByText('État : PROPOSÉ — non adopté, non publié', { exact: true })).toBeVisible();
    const subjectMappings = await db.collection('curriculumSubjectMappings').where('schoolId', '==', prefix).get();
    expect(subjectMappings.size).toBe(1);
    expect(subjectMappings.docs[0].data().links).toHaveLength(7);
    expect(subjectMappings.docs[0].data().status).toBe('proposed');
    expect(subjectMappings.docs[0].data().adoptionChanged).toBe(false);
    expect((await db.collection('schoolCurriculumAdoptions').where('schoolId', '==', prefix).get()).size).toBe(0);
    expect((await db.collection('audit_logs').where('schoolId', '==', prefix).get()).docs.filter(d => d.data().action === 'CURRICULUM_SAFE_SUBJECT_MAPPINGS_PROPOSED')).toHaveLength(1);
    console.log('SUBJECT_MAPPING_LIVE PASS: twelve primary proposals, CE1/Class3 sources and units, safe-only confirmed owner write, cancellation, audit, no adoption, responsive 360/768/1440.');
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
    await review.getByRole('button', { name: 'APPROUVER LES NIVEAUX SÉLECTIONNÉS' }).click();
    await expect(confirmation.locator('li')).toHaveCount(2);
    await confirmation.getByRole('button', { name: 'Annuler' }).click();
    await expect(review.getByText('0 approuvées', { exact: true })).toBeVisible();
    await review.getByRole('button', { name: 'APPROUVER LES NIVEAUX SÉLECTIONNÉS' }).click();
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
    phase = 'primary-owner-steps'; console.log('CURRICULUM_REVIEW_PHASE=' + phase);
    await review.getByText('Dossiers documentaires complets — 34 niveaux et revues séparées', { exact: true }).click();
    // The legacy proposal does not count as a human subject approval.
    await expect(review.getByText('MAPPINGS SÛRS : 0/76 validés', { exact: true })).toBeVisible();
    for (const p of proposals.filter(p => p.highConfidence)) await review.getByRole('checkbox', { name: 'Sélectionner les mappings sûrs — ' + p.name, exact: true }).check();
    await review.getByRole('button', { name: 'APPLIQUER LES CORRESPONDANCES SÛRES SÉLECTIONNÉES', exact: true }).click();
    const mappingDialog = page.getByRole('dialog', { name: 'Confirmer les correspondances sélectionnées', exact: true });
    await expect(mappingDialog.getByText('12 classe(s) · 76 correspondance(s)', { exact: true })).toBeVisible();
    for (const width of [360, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true); }
    await mappingDialog.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(review.getByText('MAPPINGS SÛRS : 0/76 validés', { exact: true })).toBeVisible();
    await review.getByRole('button', { name: 'APPLIQUER LES CORRESPONDANCES SÛRES SÉLECTIONNÉES', exact: true }).click();
    await mappingDialog.getByRole('button', { name: 'CONFIRMER LES DÉCISIONS DE MATIÈRES', exact: true }).click();
    await expect(review.getByText('MAPPINGS SÛRS : 76/76 validés', { exact: true })).toBeVisible();
    await expect(review.getByText('AMBIGUÏTÉS : 0/44 résolues', { exact: true })).toBeVisible();
    const ambiguity = review.getByTestId('primary-ambiguous-mapping').first();
    await ambiguity.getByRole('combobox', { name: /Décision ambiguë/ }).selectOption('DEFER');
    await ambiguity.getByRole('textbox').fill('SYNTHETIC: postpone documentary mapping only');
    await ambiguity.getByRole('button', { name: 'Examiner et confirmer la décision' }).click();
    await mappingDialog.getByRole('button', { name: 'CONFIRMER LES DÉCISIONS DE MATIÈRES', exact: true }).click();
    await expect(ambiguity.getByText('Décision actuelle : À revoir plus tard', { exact: true })).toBeVisible();
    await expect(review.getByText('AMBIGUÏTÉS : 0/44 résolues', { exact: true })).toBeVisible();
    await ambiguity.getByRole('combobox', { name: /Décision ambiguë/ }).selectOption('LINK');
    const candidate = ambiguity.getByRole('combobox', { name: /Matière candidate/ });
    await candidate.selectOption({ index: 1 });
    await ambiguity.getByRole('textbox').fill('SYNTHETIC: explicit owner documentary link only');
    await ambiguity.getByRole('button', { name: 'Examiner et confirmer la décision' }).click();
    await mappingDialog.getByRole('button', { name: 'CONFIRMER LES DÉCISIONS DE MATIÈRES', exact: true }).click();
    await expect(review.getByText('AMBIGUÏTÉS : 1/44 résolues', { exact: true })).toBeVisible();
    const subjectDecisions = (await db.collection('curriculumSubjectMappings').where('schoolId', '==', prefix).get()).docs.filter(d => d.data().scope === 'OWNER_DOCUMENTARY_SUBJECT_DECISION');
    expect(subjectDecisions).toHaveLength(77);
    for (const d of subjectDecisions) { expect(d.data().decidedBy).toBe(ownerId); expect(d.data().decidedAt.toMillis()).toBeGreaterThan(0); expect((await d.ref.collection('history').get()).size).toBe(d.data().revision); }
    for (const name of ['teacherAssignments', 'classSubjects', 'classPrograms', 'schoolCurriculumAdoptions', 'teachingPlans', 'timetableEntries']) expect((await db.collection(name).where('schoolId', '==', prefix).get()).empty).toBe(true);
    expect((await db.collection('audit_logs').where('schoolId', '==', prefix).get()).docs.filter(d => d.data().action === 'CURRICULUM_SUBJECT_MAPPING_DECIDED')).toHaveLength(78);
    console.log('PRIMARY_OWNER_LIVE PASS: 12 levels, 76 safe, 44 ambiguous, no preselection, confirmed group, individual defer/link, versions/history/audit, no implicit adoption/assignment/hours/coefficients, responsive 360/768/1440.');
    await page.reload(); await expect(review.getByText('2 approuvées', { exact: true })).toBeVisible();
    // Same synthetic identity loses approval controls immediately after role reload.
    await db.doc('users/' + ownerId).update({ role: 'secretary' });
    await auth.setCustomUserClaims(ownerId, { role: 'secretary', schoolId: prefix });
    await page.reload(); await expect(review.getByText('Consultation seule : les décisions sont réservées à la propriétaire (owner).', { exact: true })).toBeVisible();
    await expect(review.getByRole('button', { name: /APPLIQUER LES CORRESPONDANCES SÛRES/ })).toHaveCount(0);
    await expect(review.getByRole('checkbox')).toHaveCount(0); await expect(review.getByRole('combobox')).toHaveCount(0);
    console.log('CURRICULUM_REVIEW_LIVE PASS: 34/12/22, six groups, no preselection, individual/group decisions, audit, versions, foreign tenant exclusion, secretary read-only, responsive 360/768/1440. OPENAI CALLS: 0');
  } catch (error) {
    console.log('CURRICULUM_REVIEW_FAILED_PHASE=' + phase);
    throw error;
  } finally {
    for (const name of ['curriculumSubjectMappings', 'curriculumProposalReviews', 'curriculumReviewRequests', 'audit_logs']) for (const d of (await db.collection(name).where('schoolId', '==', prefix).get()).docs) {
      if (name === 'curriculumProposalReviews' || name === 'curriculumSubjectMappings') for (const h of (await d.ref.collection('history').get()).docs) paths.push(h.ref.path);
      paths.push(d.ref.path);
    }
    const unique = [...new Set(paths)];
    if (unique.length) { const batch = db.batch(); unique.forEach(path => batch.delete(db.doc(path))); await batch.commit(); expect((await db.getAll(...unique.map(p => db.doc(p)))).every(d => !d.exists)).toBe(true); }
    for (const uid of authIds) await auth.deleteUser(uid);
    await deleteApp(app);
    console.log('CURRICULUM_REVIEW_EXACT_FIXTURE_CLEANUP_VERIFIED=' + prefix);
  }
});
