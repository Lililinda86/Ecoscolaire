import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import process from 'node:process';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const execute = process.argv.includes('--execute');
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const SCHOOL_ID = process.env.SCHOOL_ID;
const ACADEMIC_YEAR_ID = process.env.ACADEMIC_YEAR_ID;
const EXPECTED_CLASS_FEES_SHA256 = process.env.EXPECTED_CLASS_FEES_SHA256;
const EXPECTED_ACADEMIC_YEAR = process.env.EXPECTED_ACADEMIC_YEAR || '2026-2027';
const deadlines = { T1: '2026-10-05', T2: '2026-12-05', T3: '2027-02-05' };

assert.notEqual(PROJECT_ID, 'ecoscolaire-c5861',
  'Direct Production backfill is forbidden; use backfill-production-tuition-deadlines.mjs with the backup gate.');

for (const [name, value] of Object.entries({
  FIREBASE_PROJECT_ID: PROJECT_ID, SCHOOL_ID, ACADEMIC_YEAR_ID, EXPECTED_CLASS_FEES_SHA256
})) assert.ok(value, `${name} is required.`);

const canonicalize = value => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
};
const digest = value => crypto.createHash('sha256')
  .update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
assert.equal(app.options.projectId, PROJECT_ID, 'Unexpected Firebase project.');
const db = getFirestore(app);
const schoolRef = db.collection('schools').doc(SCHOOL_ID);
const yearRef = db.collection('academicYears').doc(ACADEMIC_YEAR_ID);
const [schoolBefore, yearBefore] = await Promise.all([schoolRef.get(), yearRef.get()]);
assert.equal(schoolBefore.exists, true, 'School does not exist.');
assert.equal(yearBefore.exists, true, 'Academic year does not exist.');
assert.equal(schoolBefore.data()?.activeAcademicYearId, ACADEMIC_YEAR_ID, 'Academic year is not active.');
assert.equal(yearBefore.data()?.schoolId, SCHOOL_ID, 'Academic year belongs to another school.');
assert.equal(yearBefore.data()?.name, EXPECTED_ACADEMIC_YEAR, 'Academic year name mismatch.');
assert.equal(digest(schoolBefore.data()?.classFees || {}), EXPECTED_CLASS_FEES_SHA256,
  'classFees changed since the approved baseline.');

const existing = yearBefore.data()?.tuitionPaymentDeadlines;
if (existing !== undefined) {
  assert.deepEqual(existing, deadlines,
    'Existing tuition deadlines differ; refusing to overwrite a non-empty configuration.');
  process.stdout.write(JSON.stringify({ mode: execute ? 'EXECUTE' : 'DRY_RUN', status: 'NO_OP', deadlines }) + '\n');
  process.exit(0);
}

if (!execute) {
  process.stdout.write(JSON.stringify({ mode: 'DRY_RUN', status: 'WOULD_ADD', deadlines }) + '\n');
  process.exit(0);
}

await yearRef.update(new FieldPath('tuitionPaymentDeadlines'), deadlines);
const [schoolAfter, yearAfter] = await Promise.all([schoolRef.get(), yearRef.get()]);
assert.equal(digest(schoolAfter.data()?.classFees || {}), EXPECTED_CLASS_FEES_SHA256,
  'classFees changed during deadline backfill.');
assert.deepEqual(yearAfter.data()?.tuitionPaymentDeadlines, deadlines, 'Deadline verification failed.');
const beforeWithoutDeadlines = { ...(yearBefore.data() || {}) };
const afterWithoutDeadlines = { ...(yearAfter.data() || {}) };
delete beforeWithoutDeadlines.tuitionPaymentDeadlines;
delete afterWithoutDeadlines.tuitionPaymentDeadlines;
assert.deepEqual(canonicalize(afterWithoutDeadlines), canonicalize(beforeWithoutDeadlines),
  'An academic-year field other than tuitionPaymentDeadlines changed.');
process.stdout.write(JSON.stringify({
  mode: 'EXECUTE', status: 'ADDED', amountsChanged: 0, trancheAmountsChanged: 0, deadlines
}) + '\n');
