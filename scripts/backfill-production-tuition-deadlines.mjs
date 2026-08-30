import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import {
  assertTuitionAmountFingerprint,
  buildTuitionAmountFingerprint,
  canonicalize,
  TUITION_DEADLINES_2026_2027,
} from './tuition-deadline-safety.mjs';
import { PRODUCTION_PROJECT_ID, verifyProductionBackupReceipt } from './verify-production-backup-gate.mjs';

const execute = process.argv.includes('--execute');
const projectId = process.env.FIREBASE_PROJECT_ID;
const schoolId = process.env.SCHOOL_ID;
const academicYearId = process.env.ACADEMIC_YEAR_ID;
const baselinePath = process.env.TUITION_BASELINE_PATH;
const receiptPath = process.env.PRODUCTION_BACKUP_RECEIPT_PATH;

assert.equal(projectId, PRODUCTION_PROJECT_ID, 'Backfill refuses an unexpected projectId.');
for (const [name, value] of Object.entries({ SCHOOL_ID: schoolId, ACADEMIC_YEAR_ID: academicYearId, TUITION_BASELINE_PATH: baselinePath })) {
  assert.ok(value, `${name} is required.`);
}
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
assert.equal(baseline.projectId, PRODUCTION_PROJECT_ID);
assert.equal(baseline.schoolId, schoolId);
assert.equal(baseline.academicYearId, academicYearId);
assert.equal(baseline.academicYearName, '2026-2027');

if (execute) {
  assert.ok(receiptPath, 'Backfill refuses to execute without a backup gate receipt.');
  verifyProductionBackupReceipt({ receipt: JSON.parse(fs.readFileSync(receiptPath, 'utf8')) });
}

const app = initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);
const schoolRef = db.collection('schools').doc(schoolId);
const yearRef = db.collection('academicYears').doc(academicYearId);
const [schoolBefore, yearBefore] = await Promise.all([schoolRef.get(), yearRef.get()]);
assert.equal(schoolBefore.exists, true, 'School does not exist.');
assert.equal(yearBefore.exists, true, 'Academic year does not exist.');
assert.equal(schoolBefore.data()?.activeAcademicYearId, academicYearId, 'Academic year is not active.');
assert.equal(yearBefore.data()?.schoolId, schoolId, 'Academic year belongs to another school.');
assert.equal(yearBefore.data()?.name, '2026-2027', 'Academic year name mismatch.');

const fingerprintBefore = buildTuitionAmountFingerprint(schoolBefore.data()?.classFees || {});
assertTuitionAmountFingerprint(fingerprintBefore, baseline);
const existing = yearBefore.data()?.tuitionPaymentDeadlines;
if (existing !== undefined) assert.deepEqual(existing, TUITION_DEADLINES_2026_2027,
  'Refusing to overwrite a different deadline configuration.');

if (!execute) {
  process.stdout.write(`${JSON.stringify({ mode: 'DRY_RUN', status: existing ? 'NO_OP' : 'WOULD_ADD', deadlines: TUITION_DEADLINES_2026_2027 })}\n`);
  process.exit(0);
}

if (existing === undefined) await yearRef.update(new FieldPath('tuitionPaymentDeadlines'), TUITION_DEADLINES_2026_2027);
const [schoolAfter, yearAfter] = await Promise.all([schoolRef.get(), yearRef.get()]);
assertTuitionAmountFingerprint(buildTuitionAmountFingerprint(schoolAfter.data()?.classFees || {}), baseline);
assert.deepEqual(yearAfter.data()?.tuitionPaymentDeadlines, TUITION_DEADLINES_2026_2027);
const beforeWithoutDeadlines = { ...(yearBefore.data() || {}) };
const afterWithoutDeadlines = { ...(yearAfter.data() || {}) };
delete beforeWithoutDeadlines.tuitionPaymentDeadlines;
delete afterWithoutDeadlines.tuitionPaymentDeadlines;
assert.deepEqual(canonicalize(afterWithoutDeadlines), canonicalize(beforeWithoutDeadlines),
  'An academic-year field other than tuitionPaymentDeadlines changed.');
process.stdout.write(`${JSON.stringify({
  mode: 'EXECUTE', status: existing ? 'NO_OP' : 'ADDED', deadlines: TUITION_DEADLINES_2026_2027,
  classFeesChanged: 0, annualAmountsChanged: 0, installmentAmountsChanged: 0, installmentCountsChanged: 0,
})}\n`);
