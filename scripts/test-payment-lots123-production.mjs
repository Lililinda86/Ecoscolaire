import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyProductionBackupReceipt } from './verify-production-backup-gate.mjs';

export const PRODUCTION_PROJECT = 'ecoscolaire-c5861';
export const FIXTURE_PREFIX = 'payment-lots123-production-';
export const FORBIDDEN_SCHOOLS = new Set(['italo-gsb', 'school-alpha-001']);
export const PROTECTED_COLLECTIONS = [
  'students', 'studentFinance', 'payments', 'receipts',
  'financialBenefits', 'paymentMoratoriums',
];
export const REQUIRED_ZERO_RESIDUALS = [
  'students', 'studentPrivate', 'studentFinance', 'payments', 'receipts',
  'transportPaymentAllocations', 'financialBenefits', 'paymentMoratoriums',
  'cashClosures', 'cashLedgerDays', 'counters', 'authUsers', 'audit_logs',
];

export const PRODUCTION_LOTS123_ACADEMIC_YEAR = '2025-2026';
export const PRODUCTION_LOTS123_TUITION_DEADLINES = Object.freeze({
  T1: '2026-09-15',
  T2: '2026-12-15',
  T3: '2027-03-15',
});
export const PRODUCTION_LOTS123_TUITION_MORATORIUM = Object.freeze({
  academicYear: PRODUCTION_LOTS123_ACADEMIC_YEAR,
  paymentType: 'tuition',
  installment: 'T1',
  status: 'approved',
  effectiveDueDate: '2026-12-15',
});
export const PRODUCTION_LOTS123_TUITION_QUOTE = Object.freeze({
  grossExpectedAmount: 40_000,
  originalDueDate: '2026-09-15',
  effectiveDueDate: '2026-12-15',
});

export const assertProductionTuitionMoratoriumFixture = ({ academicYear, moratorium }) => {
  assert.equal(academicYear?.name, PRODUCTION_LOTS123_ACADEMIC_YEAR,
    'Production fixture academic year is invalid.');
  assert.deepEqual(academicYear?.tuitionPaymentDeadlines, PRODUCTION_LOTS123_TUITION_DEADLINES,
    'Production fixture tuition deadlines must use the canonical academic-year field.');
  assert.equal(moratorium?.academicYear, PRODUCTION_LOTS123_ACADEMIC_YEAR,
    'Production fixture moratorium academic year is invalid.');
  assert.equal(moratorium?.paymentType, 'tuition',
    'Production fixture moratorium must target Tuition through paymentType.');
  assert.equal(Object.hasOwn(moratorium || {}, 'type'), false,
    'Production fixture moratorium must not use the legacy type field.');
  assert.equal(moratorium?.installment, 'T1',
    'Production fixture moratorium installment is invalid.');
  assert.equal(moratorium?.status, 'approved',
    'Production fixture moratorium status is invalid.');
  assert.equal(moratorium?.effectiveDueDate, '2026-12-15',
    'Production fixture moratorium effective deadline is invalid.');
  return true;
};

const sha256 = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};

export const fixtureSchoolIdFor = (testRunId) => `${FIXTURE_PREFIX}${testRunId}`;

export const assertFixtureSchoolId = (fixtureSchoolId, testRunId) => {
  assert.ok(fixtureSchoolId.startsWith(FIXTURE_PREFIX), `Fixture school must start with ${FIXTURE_PREFIX}`);
  assert.equal(fixtureSchoolId, fixtureSchoolIdFor(testRunId), 'Fixture school ID must be exact for this run.');
  assert.equal(FORBIDDEN_SCHOOLS.has(fixtureSchoolId), false, 'A real school is forbidden.');
  assert.notEqual(fixtureSchoolId, 'italo-gsb', 'italo-gsb is forbidden.');
  return fixtureSchoolId;
};

export const createCleanupManifest = ({ fixtureSchoolId, testRunId }) => {
  assertFixtureSchoolId(fixtureSchoolId, testRunId);
  return {
    fixtureSchoolId,
    testRunId,
    documents: new Map(REQUIRED_ZERO_RESIDUALS.filter((name) => !['authUsers', 'counters'].includes(name))
      .map((name) => [name, new Set()])),
    authUsers: new Set(),
    counters: new Set([`receipts_${fixtureSchoolId}`]),
  };
};

export const cleanupExactManifest = async (manifest, deleteExact) => {
  assertFixtureSchoolId(manifest.fixtureSchoolId, manifest.testRunId);
  for (const [collection, ids] of manifest.documents) {
    for (const id of ids) await deleteExact({ collection, id, fixtureSchoolId: manifest.fixtureSchoolId });
  }
  for (const id of manifest.counters) await deleteExact({ collection: 'counters', id, fixtureSchoolId: manifest.fixtureSchoolId });
  for (const uid of manifest.authUsers) await deleteExact({ collection: 'Auth', id: uid, fixtureSchoolId: manifest.fixtureSchoolId });
};

export const assertZeroResiduals = (residuals) => {
  for (const name of REQUIRED_ZERO_RESIDUALS) assert.equal(residuals[name], 0, `${name} residual must be zero.`);
  assert.equal(residuals.residuals, 0, 'Residuals must be zero.');
  assert.equal(residuals.orphans, 0, 'Orphans must be zero.');
};

export const validateProductionLotsConfig = (env = process.env) => {
  const testRunId = String(env.PAYMENT_LOTS123_TEST_RUN_ID || '').trim();
  assert.match(testRunId, /^[0-9]+-[0-9]+$/, 'testRunId must be <runId>-<attempt>.');
  const fixtureSchoolId = assertFixtureSchoolId(String(env.PAYMENT_LOTS123_FIXTURE_SCHOOL_ID || ''), testRunId);
  assert.equal(env.PAYMENT_LOTS123_CONFIRMATION, 'RUN_PAYMENT_LOTS123_PRODUCTION');
  assert.equal(env.PAYMENT_LOTS123_DEPLOYMENT_VERIFIED, 'true', 'Exact deployment gate is required.');
  assert.equal(env.PAYMENT_LOTS123_CLEANUP_CAPABILITY_VERIFIED, 'true', 'Cleanup capability gate is required.');
  assert.equal(env.PAYMENT_LOTS123_PROJECT_ID, PRODUCTION_PROJECT);
  assert.equal(env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT, PRODUCTION_PROJECT);
  assert.match(env.PAYMENT_LOTS123_EXPECTED_MAIN_SHA || '', /^[0-9a-f]{40}$/);
  assert.equal(env.GITHUB_SHA, env.PAYMENT_LOTS123_EXPECTED_MAIN_SHA, 'Runtime SHA mismatch.');
  assert.equal(new URL(env.PAYMENT_LOTS123_APP_URL || '').origin, 'https://ecoscolaire.vercel.app');
  const receiptPath = env.PRODUCTION_BACKUP_RECEIPT_PATH;
  assert.ok(receiptPath, 'Backup gate receipt path is required.');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  verifyProductionBackupReceipt({ receipt, projectId: PRODUCTION_PROJECT });
  return { testRunId, fixtureSchoolId, receipt };
};

const financialSchoolSnapshot = (data = {}) => ({
  classFees: data.classFees ?? null,
  annualAmounts: data.annualAmounts ?? null,
  installmentAmounts: data.installmentAmounts ?? null,
  installmentCounts: data.installmentCounts ?? null,
  paymentDeadlines: data.paymentDeadlines ?? null,
  tuitionDeadlines: data.tuitionDeadlines ?? null,
  transportPolicy: data.transportPolicy ?? null,
});

export const captureFinancialFingerprints = async (db) => {
  const collections = {};
  for (const name of PROTECTED_COLLECTIONS) {
    const snapshot = await db.collection(name).get();
    const rows = snapshot.docs.filter((item) => item.data().testFixture !== true)
      .map((item) => [item.id, item.updateTime?.toDate().toISOString() || null]).sort();
    collections[name] = { count: rows.length, fingerprint: sha256(rows) };
  }
  const schools = await db.collection('schools').get();
  const realSchools = schools.docs.filter((item) => item.data().testFixture !== true)
    .map((item) => [item.id, canonical(financialSchoolSnapshot(item.data()))]).sort(([a], [b]) => a.localeCompare(b));
  return {
    classFees: sha256(realSchools.map(([id, data]) => [id, data.classFees])),
    annualAmounts: sha256(realSchools.map(([id, data]) => [id, data.annualAmounts])),
    installmentAmounts: sha256(realSchools.map(([id, data]) => [id, data.installmentAmounts])),
    installmentCounts: sha256(realSchools.map(([id, data]) => [id, data.installmentCounts])),
    deadlines: sha256(realSchools.map(([id, data]) => [id, data.paymentDeadlines, data.tuitionDeadlines])),
    transportTariffs: sha256(realSchools.map(([id, data]) => [id, data.transportPolicy])),
    collections,
  };
};

export const compareFinancialFingerprints = (before, after) => {
  assert.deepEqual(after, before, 'Production financial fingerprints changed outside the exact fixture.');
  return true;
};

export const extractChildFailureMarker = (output = '') => {
  const prefix = 'PAYMENT_LOTS123_FAILURE ';
  const line = String(output).split(/\r?\n/).find((item) => item.startsWith(prefix));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(prefix.length));
  } catch {
    return { scenarioId: 'MALFORMED_FAILURE_MARKER', raw: line.slice(prefix.length) };
  }
};

export const assertProductionChildResult = (child) => {
  const stdout = String(child?.stdout || '');
  const stderr = String(child?.stderr || '');
  const combined = `${stdout}\n${stderr}`;
  if (child?.error) {
    throw new Error(`Child Production transport runner failed to spawn: ${child.error.message}`, { cause: child.error });
  }
  if (child?.signal || child?.status !== 0) {
    const marker = extractChildFailureMarker(combined);
    const scenario = marker?.scenarioId ? ` scenario=${marker.scenarioId}` : '';
    const signal = child?.signal ? ` signal=${child.signal}` : '';
    const failure = new Error(
      `Child Production transport runner exited with code ${child?.status ?? 'null'}.${signal}${scenario}. See child diagnostic above.`,
    );
    failure.code = 'CHILD_RUNNER_FAILED';
    failure.childExitCode = child?.status ?? null;
    failure.childSignal = child?.signal ?? null;
    failure.childFailure = marker;
    throw failure;
  }
  if (!stdout.includes('PAYMENT_LOTS123_CHECKPOINT PAYMENT_LOTS123_COMPLETE')) {
    throw new Error('Child Production transport runner exited successfully without PAYMENT_LOTS123_COMPLETE.');
  }
  return true;
};

export const runProductionLots123 = async (env = process.env) => {
  const config = validateProductionLotsConfig(env);
  createCleanupManifest(config);
  const app = initializeApp({ credential: applicationDefault(), projectId: PRODUCTION_PROJECT }, `lots123-guard-${config.testRunId}`);
  const db = getFirestore(app);
  const before = await captureFinancialFingerprints(db);
  await deleteApp(app);
  const child = spawnSync(process.execPath, ['scripts/test-transport-payments-production.mjs'], {
    cwd: process.cwd(), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, env: {
      ...env,
      TRANSPORT_PAYMENT_LOTS123_RUNNER: 'true',
      TRANSPORT_RELEASE_MODE: 'production',
      TRANSPORT_FIREBASE_PROJECT_ID: PRODUCTION_PROJECT,
      TRANSPORT_TEST_FIXTURE: 'true',
      TRANSPORT_TEST_RUN_ID: config.testRunId,
      TRANSPORT_FIXTURE_SCHOOL_ID: config.fixtureSchoolId,
      TRANSPORT_APP_URL: env.PAYMENT_LOTS123_APP_URL,
      TRANSPORT_REQUIRED_FUNCTIONS_VERIFIED: 'true',
      TRANSPORT_CLEANUP_CAPABILITY_VERIFIED: 'true',
      TRANSPORT_FIREBASE_API_KEY: env.VITE_FIREBASE_API_KEY,
      TRANSPORT_FIREBASE_AUTH_DOMAIN: env.VITE_FIREBASE_AUTH_DOMAIN,
      TRANSPORT_FIREBASE_CLIENT_PROJECT_ID: env.VITE_FIREBASE_PROJECT_ID,
      TRANSPORT_FIREBASE_STORAGE_BUCKET: env.VITE_FIREBASE_STORAGE_BUCKET,
      TRANSPORT_FIREBASE_MESSAGING_SENDER_ID: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      TRANSPORT_FIREBASE_APP_ID: env.VITE_FIREBASE_APP_ID,
    },
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  assertProductionChildResult(child);
  const afterApp = initializeApp({ credential: applicationDefault(), projectId: PRODUCTION_PROJECT }, `lots123-after-${config.testRunId}`);
  const after = await captureFinancialFingerprints(getFirestore(afterApp));
  await deleteApp(afterApp);
  compareFinancialFingerprints(before, after);
  console.log(`PAYMENT LOTS 1-3 PRODUCTION: PASS school=${config.fixtureSchoolId} realDataModified=0 residuals=0 orphans=0`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runProductionLots123().catch((error) => {
    console.error(`PAYMENT LOTS 1-3 PRODUCTION: FAIL ${error?.message || error}`);
    process.exitCode = 1;
  });
}
