import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  buildTuitionAmountFingerprint,
  canonicalize,
  digest,
} from './tuition-deadline-safety.mjs';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'ecoscolaire-c5861';
const SCHOOL_ID = process.env.SCHOOL_ID || 'italo-gsb';
const OUTPUT_PATH = process.env.AUDIT_OUTPUT_PATH || '';

const snapshotCollection = async (db, collectionName) => {
  const snapshot = await db.collection(collectionName).where('schoolId', '==', SCHOOL_ID).get();
  return {
    count: snapshot.size,
    sha256: digest(snapshot.docs.map(item => ({ id: item.id, data: item.data() })))
  };
};

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
assert.equal(app.options.projectId, PROJECT_ID, 'Unexpected Firebase project.');
const db = getFirestore(app);

const schoolSnapshot = await db.collection('schools').doc(SCHOOL_ID).get();
assert.equal(schoolSnapshot.exists, true, `School ${SCHOOL_ID} does not exist.`);
const school = schoolSnapshot.data() || {};
assert.ok(typeof school.activeAcademicYearId === 'string' && school.activeAcademicYearId,
  'School has no activeAcademicYearId.');

const academicYearSnapshot = await db.collection('academicYears').doc(school.activeAcademicYearId).get();
assert.equal(academicYearSnapshot.exists, true, 'Active academic year document does not exist.');
const academicYear = academicYearSnapshot.data() || {};
assert.equal(academicYear.schoolId, SCHOOL_ID, 'Academic year belongs to another school.');

const classFees = canonicalize(school.classFees || {});
const amountFingerprint = buildTuitionAmountFingerprint(classFees);
const monetarySnapshot = canonicalize({
  globalFees: school.globalFees || null,
  classFees
});
const collections = {};
for (const name of ['students', 'studentFinance', 'payments', 'financialBenefits', 'paymentMoratoriums']) {
  collections[name] = await snapshotCollection(db, name);
}

const report = canonicalize({
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  projectId: PROJECT_ID,
  schoolId: SCHOOL_ID,
  academicYearId: school.activeAcademicYearId,
  academicYearName: academicYear.name || null,
  classFees,
  classFeesSha256: amountFingerprint.classFeesSha256,
  annualAmountsSha256: amountFingerprint.annualAmountsSha256,
  installmentAmountsSha256: amountFingerprint.installmentAmountsSha256,
  installmentCountsSha256: amountFingerprint.installmentCountsSha256,
  annualAmounts: amountFingerprint.annualAmounts,
  installmentAmounts: amountFingerprint.installmentAmounts,
  installmentCounts: amountFingerprint.installmentCounts,
  monetarySnapshotSha256: digest(monetarySnapshot),
  paymentDeadlines: school.paymentDeadlines || null,
  tuitionPaymentDeadlines: academicYear.tuitionPaymentDeadlines || null,
  collections
});

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (OUTPUT_PATH) fs.writeFileSync(OUTPUT_PATH, serialized, { encoding: 'utf8', flag: 'wx' });
process.stdout.write(serialized);
