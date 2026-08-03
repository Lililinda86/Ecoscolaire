const assert = require('assert');
const path = require('path');
const Module = require('module');
const originalRequire = Module.prototype.require;

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;

if (!emulatorHost) {
  throw new Error('FIRESTORE_EMULATOR_HOST est obligatoire.');
}
if (projectId !== 'demo-school') {
  throw new Error(`Projet émulateur interdit : ${projectId ?? 'absent'}`);
}
if (projectId.includes('staging') || projectId.includes('prod') || projectId.includes('ecoscolaire')) {
  throw new Error('Projet réel interdit.');
}

const functionsAdminPath = path.resolve(__dirname, '../../functions/node_modules/firebase-admin');

// Intercept firebase-admin imports to redirect to the functions instance
Module.prototype.require = function() {
  const name = arguments[0];
  if (name === 'firebase-admin') {
    return originalRequire.call(this, functionsAdminPath);
  }
  if (name === 'firebase-admin/firestore') {
    return originalRequire.call(this, path.join(functionsAdminPath, 'lib/firestore'));
  }
  return originalRequire.apply(this, arguments);
};

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: 'demo-school' });
}

const db = getFirestore();
const { updateAcademicYearBounds } = require('../../functions/lib/academic/updateAcademicYearBounds.js');

async function resetDb() {
  const collections = ['users', 'academicYears', 'periods'];
  for (const col of collections) {
    const snap = await db.collection(col).get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
    }
  }
}

async function runEmulatorTests() {
  console.log('=== DÉMARRAGE DES TESTS ÉMULATEUR FIRESTORE RÉEL ===');
  await resetDb();

  const schoolId = 'emu-school-1';
  const otherSchoolId = 'emu-school-2';

  // Setup Users
  await db.collection('users').doc('u-owner').set({ id: 'u-owner', role: 'owner', schoolId, isActive: true });
  await db.collection('users').doc('u-director').set({ id: 'u-director', role: 'director', schoolId, isActive: true });
  await db.collection('users').doc('u-teacher').set({ id: 'u-teacher', role: 'teacher', schoolId, isActive: true });
  await db.collection('users').doc('u-parent').set({ id: 'u-parent', role: 'parent', schoolId, isActive: true });
  await db.collection('users').doc('u-other-owner').set({ id: 'u-other-owner', role: 'owner', schoolId: otherSchoolId, isActive: true });

  const ctxOwner = { auth: { uid: 'u-owner' } };
  const ctxDirector = { auth: { uid: 'u-director' } };
  const ctxTeacher = { auth: { uid: 'u-teacher' } };
  const ctxParent = { auth: { uid: 'u-parent' } };
  const ctxOtherOwner = { auth: { uid: 'u-other-owner' } };
  const ctxMissingUser = { auth: { uid: 'u-missing' } };

  // Setup Academic Years
  await db.collection('academicYears').doc('ay-draft').set({ id: 'ay-draft', schoolId, status: 'draft', startDate: '2026-09-01', endDate: '2027-06-30' });
  await db.collection('academicYears').doc('ay-draft-invalid').set({ id: 'ay-draft-invalid', schoolId, status: 'draft', startDate: '2026-09-01', endDate: '2027-06-30' });
  await db.collection('academicYears').doc('ay-active').set({ id: 'ay-active', schoolId, status: 'active', startDate: '2027-09-01', endDate: '2028-06-30' });
  await db.collection('academicYears').doc('ay-closed').set({ id: 'ay-closed', schoolId, status: 'closed', startDate: '2025-09-01', endDate: '2026-06-30' });
  await db.collection('academicYears').doc('ay-archived').set({ id: 'ay-archived', schoolId, status: 'archived', startDate: '2024-09-01', endDate: '2025-06-30' });

  // Setup Periods
  await db.collection('periods').doc('p-valid').set({ id: 'p-valid', academicYearId: 'ay-active', schoolId, startDate: '2027-09-05', endDate: '2027-12-20' });
  await db.collection('periods').doc('p-invalid').set({ id: 'p-invalid', academicYearId: 'ay-draft-invalid', schoolId, startDate: null, endDate: null });

  const defaultArgs = { schoolId, academicYearId: 'ay-active', startDate: '2027-08-15', endDate: '2028-07-15' };

  async function expectError(promise, expectedCode) {
    try {
      await promise;
      assert.fail(`Devrait échouer avec ${expectedCode}`);
    } catch (err) {
      if (err.code !== expectedCode) {
         console.error('Erreur inattendue:', err);
      }
      assert.strictEqual(err.code, expectedCode);
    }
  }

  console.log('1. Auth absente...');
  await expectError(updateAcademicYearBounds.run(defaultArgs, {}), 'unauthenticated');

  console.log('2. Document utilisateur absent...');
  await expectError(updateAcademicYearBounds.run(defaultArgs, ctxMissingUser), 'permission-denied');

  console.log('3. Owner accepté...');
  const resOwner = await updateAcademicYearBounds.run(defaultArgs, ctxOwner);
  assert.ok(resOwner.success);

  console.log('4. Director accepté...');
  const resDir = await updateAcademicYearBounds.run({ ...defaultArgs, startDate: '2027-08-16' }, ctxDirector);
  assert.ok(resDir.success);

  console.log('5. Teacher refusé...');
  await expectError(updateAcademicYearBounds.run(defaultArgs, ctxTeacher), 'permission-denied');

  console.log('6. Parent refusé...');
  await expectError(updateAcademicYearBounds.run(defaultArgs, ctxParent), 'permission-denied');

  console.log('7. Autre école refusée...');
  await expectError(updateAcademicYearBounds.run(defaultArgs, ctxOtherOwner), 'permission-denied');

  console.log('8. AcademicYear absente...');
  await expectError(updateAcademicYearBounds.run({ ...defaultArgs, academicYearId: 'ay-missing' }, ctxOwner), 'not-found');

  console.log('9. Draft acceptée...');
  const resDraft = await updateAcademicYearBounds.run({ ...defaultArgs, academicYearId: 'ay-draft', startDate: '1990-01-01', endDate: '1990-12-31' }, ctxOwner);
  assert.ok(resDraft.success);

  console.log('10. Active acceptée...');
  const resActive = await updateAcademicYearBounds.run(defaultArgs, ctxOwner);
  assert.ok(resActive.success);

  console.log('11. Closed refusée...');
  await expectError(updateAcademicYearBounds.run({ ...defaultArgs, academicYearId: 'ay-closed', startDate: '1991-01-01', endDate: '1991-12-31' }, ctxOwner), 'failed-precondition');

  console.log('12. Archived refusée...');
  await expectError(updateAcademicYearBounds.run({ ...defaultArgs, academicYearId: 'ay-archived', startDate: '1992-01-01', endDate: '1992-12-31' }, ctxOwner), 'failed-precondition');

  console.log('13. Date impossible refusée...');
  await expectError(updateAcademicYearBounds.run({ ...defaultArgs, startDate: '2027-02-30' }, ctxOwner), 'invalid-argument');
  await expectError(updateAcademicYearBounds.run({ ...defaultArgs, startDate: '2027-02-29' }, ctxOwner), 'invalid-argument');

  console.log('14. DD/MM/YYYY refusé...');
  await expectError(updateAcademicYearBounds.run({ ...defaultArgs, startDate: '15/08/2027' }, ctxOwner), 'invalid-argument');
  await expectError(updateAcademicYearBounds.run({ ...defaultArgs, startDate: '' }, ctxOwner), 'invalid-argument');

  console.log('15. Chevauchement refusé...');
  await expectError(updateAcademicYearBounds.run({ ...defaultArgs, startDate: '2026-10-01' }, ctxOwner), 'failed-precondition');

  console.log('16. Period hors nouvelles bornes refusée...');
  await expectError(updateAcademicYearBounds.run({ ...defaultArgs, startDate: '2027-10-01' }, ctxOwner), 'failed-precondition');

  console.log('17. Period avec date invalide refusée...');
  await expectError(updateAcademicYearBounds.run({ ...defaultArgs, academicYearId: 'ay-draft-invalid', startDate: '2026-08-15', endDate: '2027-07-15' }, ctxOwner), 'failed-precondition');

  console.log('18. Succès canonique et vérification parité de dates...');
  const dateRes = await updateAcademicYearBounds.run({ ...defaultArgs, academicYearId: 'ay-draft', startDate: '2032-02-29', endDate: '2032-12-31' }, ctxOwner);
  assert.strictEqual(dateRes.startDate, '2032-02-29');

  console.log('19. Champs invariants inchangés...');
  const snap = await db.collection('academicYears').doc('ay-active').get();
  const data = snap.data();
  assert.strictEqual(data.status, 'active');
  assert.strictEqual(data.schoolId, schoolId);

  console.log('20. Scénario concurrent...');
  await resetDb();
  await db.collection('users').doc('u-owner').set({ id: 'u-owner', role: 'owner', schoolId, isActive: true });
  await db.collection('academicYears').doc('ay-concur').set({ id: 'ay-concur', schoolId, status: 'active', startDate: '2026-09-01', endDate: '2027-06-30' });
  await db.collection('periods').doc('p-concur').set({ id: 'p-concur', academicYearId: 'ay-concur', schoolId, startDate: '2026-09-05', endDate: '2026-12-20' });

  // 2 corrections simultanées
  const p1 = updateAcademicYearBounds.run({ schoolId, academicYearId: 'ay-concur', startDate: '2026-08-01', endDate: '2027-07-01' }, ctxOwner);
  const p2 = updateAcademicYearBounds.run({ schoolId, academicYearId: 'ay-concur', startDate: '2026-08-15', endDate: '2027-07-15' }, ctxOwner);

  const results = await Promise.allSettled([p1, p2]);
  
  // Au moins une des transactions a réussi et les bornes sont valides
  const finalSnap = await db.collection('academicYears').doc('ay-concur').get();
  const finalData = finalSnap.data();
  assert.ok(
    (finalData.startDate === '2026-08-01' && finalData.endDate === '2027-07-01') ||
    (finalData.startDate === '2026-08-15' && finalData.endDate === '2027-07-15')
  );
  assert.strictEqual(finalData.schoolId, schoolId);

  console.log('✅ TOUS LES TESTS DE L\'ÉMULATEUR FIRESTORE RÉEL SONT PASSÉS !');
}

runEmulatorTests().catch(err => {
  console.error('❌ ÉCHEC DES TESTS ÉMULATEUR :', err);
  process.exit(1);
});
