const assert = require('assert');
const path = require('path');
const Module = require('module');
const originalRequire = Module.prototype.require;

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST est obligatoire.');
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (projectId !== 'demo-school') throw new Error(`Projet émulateur interdit: ${projectId || 'absent'}`);

const adminPath = path.resolve(__dirname, '../../functions/node_modules/firebase-admin');
Module.prototype.require = function patchedRequire() {
  const name = arguments[0];
  if (name === 'firebase-admin') return originalRequire.call(this, adminPath);
  if (name === 'firebase-admin/firestore') return originalRequire.call(this, path.join(adminPath, 'lib/firestore'));
  return originalRequire.apply(this, arguments);
};

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId });
const db = admin.firestore();
const { manageAcademicPeriod } = require('../../functions/lib/academic/manageAcademicPeriod.js');

const ctx = uid => ({ auth: { uid } });
const expectBusinessError = async (promise, code) => {
  try { await promise; assert.fail(`Erreur ${code} attendue`); }
  catch (error) { assert.strictEqual(error.details?.businessCode, code); }
};

async function reset() {
  for (const collection of ['audit_logs', 'periods', 'academicYears', 'users']) {
    const snapshot = await db.collection(collection).get();
    await Promise.all(snapshot.docs.map(document => document.ref.delete()));
  }
}

async function run() {
  await reset();
  const schoolId = 'school-a';
  await Promise.all([
    db.collection('users').doc('owner').set({ role: 'owner', schoolId, isActive: true }),
    db.collection('users').doc('director').set({ role: 'director', schoolId, isActive: true }),
    db.collection('users').doc('secretary').set({ role: 'secretary', schoolId, isActive: true }),
    db.collection('users').doc('teacher').set({ role: 'teacher', schoolId, isActive: true }),
    db.collection('users').doc('other-owner').set({ role: 'owner', schoolId: 'school-b', isActive: true }),
    db.collection('academicYears').doc('year-fixture').set({ id: 'year-fixture', schoolId, status: 'active', startDate: '2030-09-01', endDate: '2031-06-30', version: 1, testFixture: true, testRunId: 'period-test' }),
  ]);

  const create = (name, order, startDate, endDate, actor = 'owner') => manageAcademicPeriod.run({
    action: 'CREATE', schoolId, academicYearId: 'year-fixture',
    profile: { name, type: 'term', order, startDate, endDate, testFixture: true, testRunId: 'period-test' },
  }, ctx(actor));

  const a = await create('Période A', 1, '2030-09-01', '2030-12-20');
  assert.strictEqual(a.period.status, 'draft');
  assert.notStrictEqual(a.period.id, 'client-id');

  const edited = await manageAcademicPeriod.run({
    action: 'UPDATE', schoolId, academicYearId: 'year-fixture', periodId: a.period.id,
    profile: { name: 'Période A corrigée', type: 'term', order: 1, startDate: '2030-09-01', endDate: '2030-12-19', testFixture: true, testRunId: 'period-test' },
  }, ctx('director'));
  assert.strictEqual(edited.period.name, 'Période A corrigée');

  const b = await create('Période B', 2, '2031-01-05', '2031-03-31');
  await expectBusinessError(create('Chevauchement', 3, '2030-12-19', '2031-01-10'), 'PERIOD_OVERLAP');
  await expectBusinessError(create('Ordre dupliqué', 2, '2031-04-01', '2031-04-30'), 'DUPLICATE_ORDER');
  await expectBusinessError(create('Interdit', 3, '2031-04-01', '2031-04-30', 'secretary'), 'PERMISSION_DENIED');
  await expectBusinessError(create('Interdit', 3, '2031-04-01', '2031-04-30', 'teacher'), 'PERMISSION_DENIED');
  await expectBusinessError(create('Inter-école', 3, '2031-04-01', '2031-04-30', 'other-owner'), 'SCHOOL_MISMATCH');

  await manageAcademicPeriod.run({ action: 'OPEN', schoolId, academicYearId: 'year-fixture', periodId: a.period.id }, ctx('owner'));
  await expectBusinessError(
    manageAcademicPeriod.run({ action: 'OPEN', schoolId, academicYearId: 'year-fixture', periodId: b.period.id }, ctx('owner')),
    'OPEN_PERIOD_EXISTS',
  );
  await manageAcademicPeriod.run({ action: 'CLOSE', schoolId, academicYearId: 'year-fixture', periodId: a.period.id }, ctx('owner'));
  await expectBusinessError(
    manageAcademicPeriod.run({ action: 'OPEN', schoolId, academicYearId: 'year-fixture', periodId: a.period.id }, ctx('owner')),
    'CLOSED_PERIOD_IMMUTABLE',
  );
  await manageAcademicPeriod.run({ action: 'OPEN', schoolId, academicYearId: 'year-fixture', periodId: b.period.id }, ctx('owner'));

  const [year, periodA, periodB, audits] = await Promise.all([
    db.collection('academicYears').doc('year-fixture').get(),
    db.collection('periods').doc(a.period.id).get(),
    db.collection('periods').doc(b.period.id).get(),
    db.collection('audit_logs').where('testRunId', '==', 'period-test').get(),
  ]);
  assert.strictEqual(year.data().openPeriodId, b.period.id);
  assert.strictEqual(periodA.data().status, 'closed');
  assert.strictEqual(periodB.data().status, 'open');
  assert.strictEqual(audits.size, 6);
  assert.ok(audits.docs.every(document => document.data().canonicalBackendAudit === true));
  console.log('Academic period backend lifecycle: PASS');
}

run().catch(error => { console.error(error); process.exit(1); });
