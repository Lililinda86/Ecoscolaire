import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  FIXTURE_PREFIX, assertFixtureSchoolId, assertZeroResiduals, cleanupExactManifest,
  compareFinancialFingerprints, createCleanupManifest, fixtureSchoolIdFor,
  PRODUCTION_LOTS123_ACADEMIC_YEAR, PRODUCTION_LOTS123_TUITION_DEADLINES,
  PRODUCTION_LOTS123_TUITION_MORATORIUM, PRODUCTION_LOTS123_TUITION_QUOTE,
  assertProductionTuitionMoratoriumFixture, validateProductionLotsConfig,
} from '../../scripts/test-payment-lots123-production.mjs';
import {
  buildStudentPrivateTransportAuditUpdate,
} from '../../scripts/test-transport-payments-production.mjs';
import { validateExactDeploymentRun } from '../../scripts/verify-exact-deployment-run.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const workflow = read('.github/workflows/payment-lots123-production-validation.yml');
const runner = read('scripts/test-payment-lots123-production.mjs');
const transportRunner = read('scripts/test-transport-payments-production.mjs');
const rules = read('firestore.rules');
const rulesSpec = read('tests/security/rules.spec.mjs');
const ci = read('.github/workflows/ci.yml');

const validReceiptPath = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lots123-receipt-'));
  const file = path.join(dir, 'receipt.json');
  fs.writeFileSync(file, JSON.stringify({
    status: 'PASS', projectId: 'ecoscolaire-c5861', monitorErrors: 0,
    backupTimestamp: '2026-09-01T10:13:03.639Z', evaluatedAt: '2026-09-01T10:13:57.534Z',
  }));
  return file;
};

const validEnv = () => ({
  PAYMENT_LOTS123_TEST_RUN_ID: '123456-1',
  PAYMENT_LOTS123_FIXTURE_SCHOOL_ID: 'payment-lots123-production-123456-1',
  PAYMENT_LOTS123_CONFIRMATION: 'RUN_PAYMENT_LOTS123_PRODUCTION',
  PAYMENT_LOTS123_DEPLOYMENT_VERIFIED: 'true',
  PAYMENT_LOTS123_CLEANUP_CAPABILITY_VERIFIED: 'true',
  PAYMENT_LOTS123_PROJECT_ID: 'ecoscolaire-c5861',
  GOOGLE_CLOUD_PROJECT: 'ecoscolaire-c5861',
  PAYMENT_LOTS123_EXPECTED_MAIN_SHA: 'a'.repeat(40), GITHUB_SHA: 'a'.repeat(40),
  PAYMENT_LOTS123_APP_URL: 'https://ecoscolaire.vercel.app',
  PRODUCTION_BACKUP_RECEIPT_PATH: validReceiptPath(),
});

const firebaseDeploymentSha = 'd0eca1ef2bc8eaae13ffdc28ecc455f01f5a78a9';
const firebaseDeploymentRun = (overrides = {}) => ({
  conclusion: 'success',
  event: 'push',
  head_branch: 'main',
  head_sha: firebaseDeploymentSha,
  id: 101,
  path: '.github/workflows/firebase-deploy.yml',
  status: 'completed',
  workflow_id: 295023413,
  ...overrides,
});
const validateProductionFirebaseDeployment = (workflowRuns) => validateExactDeploymentRun(
  { workflow_runs: workflowRuns },
  {
    allowedEvents: ['push', 'workflow_dispatch'],
    expectedBranch: 'main',
    expectedSha: firebaseDeploymentSha,
    expectedWorkflowId: 295023413,
    expectedWorkflowPath: '.github/workflows/firebase-deploy.yml',
  },
);

test('Production Firebase gate accepts approved push and manual deployments only', () => {
  assert.equal(validateProductionFirebaseDeployment([firebaseDeploymentRun()]).id, 101);
  assert.equal(validateProductionFirebaseDeployment([
    firebaseDeploymentRun({ event: 'workflow_dispatch', id: 102 }),
  ]).id, 102);
  for (const run of [
    firebaseDeploymentRun({ path: '.github/workflows/unrelated.yml', event: 'workflow_dispatch' }),
    firebaseDeploymentRun({ workflow_id: 999999999, event: 'workflow_dispatch' }),
    firebaseDeploymentRun({ head_sha: 'b'.repeat(40) }),
    firebaseDeploymentRun({ head_branch: 'staging' }),
    firebaseDeploymentRun({ conclusion: 'failure' }),
    firebaseDeploymentRun({ conclusion: 'cancelled' }),
    firebaseDeploymentRun({ conclusion: 'skipped' }),
    firebaseDeploymentRun({ path: '.github/workflows/deploy-staging.yml' }),
    firebaseDeploymentRun({ path: undefined }),
  ]) assert.throws(() => validateProductionFirebaseDeployment([run]));
  assert.throws(() => validateExactDeploymentRun({ workflow_runs: [firebaseDeploymentRun()] }, {
    allowedEvents: ['push', 'workflow_dispatch'], expectedBranch: 'main', expectedSha: 'abc123',
    expectedWorkflowId: 295023413, expectedWorkflowPath: '.github/workflows/firebase-deploy.yml',
  }), /full exact deployment SHA/);
});

test('Production Firebase gate selects a successful approved manual run over failed or unrelated runs', () => {
  const selected = validateProductionFirebaseDeployment([
    firebaseDeploymentRun({ conclusion: 'failure', id: 103 }),
    firebaseDeploymentRun({ event: 'workflow_dispatch', id: 104 }),
    firebaseDeploymentRun({
      event: 'workflow_dispatch', id: 105, path: '.github/workflows/unrelated.yml', workflow_id: 42,
    }),
  ]);
  assert.equal(selected.id, 104);
});

test('Production workflow queries the approved Firebase workflow without a brittle event filter', () => {
  assert.match(workflow, /actions\/workflows\/firebase-deploy\.yml\/runs/);
  assert.match(workflow, /-f head_sha="\$PAYMENT_LOTS123_EXPECTED_MAIN_SHA" -f branch=main -f per_page=100/);
  assert.doesNotMatch(workflow, /-f event=push/);
  assert.match(workflow, /295023413 'push,workflow_dispatch'/);
});

const validStudentPrivateTransportAuditInput = () => ({
  transportZonePk: 35,
  transportNeighborhood: 'Quartier B',
  transportPickupPoint: 'Point B',
  updatedAt: { _methodName: 'serverTimestamp' },
  updatedBy: 'secretary-fixture-uid',
  secretaryFixtureUid: 'secretary-fixture-uid',
});

test('studentPrivate transport update requires the canonical secretary audit payload', () => {
  const input = validStudentPrivateTransportAuditInput();
  assert.deepEqual(buildStudentPrivateTransportAuditUpdate(input), {
    transportZonePk: 35,
    transportNeighborhood: 'Quartier B',
    transportPickupPoint: 'Point B',
    updatedAt: input.updatedAt,
    updatedBy: 'secretary-fixture-uid',
  });

  for (const field of ['updatedAt', 'updatedBy']) {
    const invalid = validStudentPrivateTransportAuditInput();
    delete invalid[field];
    assert.throws(() => buildStudentPrivateTransportAuditUpdate(invalid), field);
  }
  assert.throws(() => buildStudentPrivateTransportAuditUpdate({
    ...validStudentPrivateTransportAuditInput(), updatedBy: 'foreign-uid',
  }), /secretary fixture UID/);
  for (const field of ['id', 'studentId', 'schoolId']) {
    assert.throws(() => buildStudentPrivateTransportAuditUpdate({
      ...validStudentPrivateTransportAuditInput(), [field]: 'forbidden',
    }), /forbidden field/);
  }
});

test('Production runner and Rules retain the same-school studentPrivate audit contract', () => {
  assert.match(transportRunner, /updatedAt: serverTimestamp\(\), updatedBy: secretaryFixtureUid/);
  assert.match(transportRunner, /const secretaryFixtureUid = credentials\.get\('secretary'\)\.uid/);
  assert.match(rules, /request\.resource\.data\.updatedAt == request\.time/);
  assert.match(rules, /request\.resource\.data\.updatedBy == request\.auth\.uid/);
  assert.match(rulesSpec, /allows a same-school secretary to persist transport enrollment/);
  assert.match(rulesSpec, /denies transport enrollment writes from a cross-school secretary/);
  assert.match(rulesSpec, /denies transport enrollment writes from a linked parent/);
});

test('every Firebase client write is canonical or an explicit denial assertion', () => {
  const clientWrites = transportRunner.match(/\b(?:setDoc|updateDoc|deleteDoc)\(/g) || [];
  assert.equal(clientWrites.length, 8);
  assert.match(transportRunner,
    /updateDoc\(doc\(secretary\.firestore, 'studentPrivate', editStudent\),[\s\S]*buildStudentPrivateTransportAuditUpdate/);
  assert.match(transportRunner,
    /updateDoc\(doc\(secretary\.firestore, 'students', editStudent\), \{ usesTransport: false, transportStatus: 'none' \}\)/);
  assert.match(transportRunner,
    /updateDoc\(doc\(secretary\.firestore, 'students', editStudent\), \{ usesTransport: true, transportStatus: 'active' \}\)/);
  assert.match(transportRunner, /expectFailure\(\(\) => updateDoc\(doc\(parent\.firestore, 'students'/);
  assert.match(transportRunner, /expectFailure\(\(\) => setDoc\(doc\(secretary\.firestore, collection, directId\)/);
  assert.match(transportRunner, /expectFailure\(\(\) => updateDoc\(doc\(secretary\.firestore, collection, id\)/);
  assert.match(transportRunner, /expectFailure\(\(\) => deleteDoc\(doc\(secretary\.firestore, collection, id\)/);
  assert.match(transportRunner, /expectFailure\(\(\) => setDoc\(doc\(client\.firestore, 'studentFinance'/);
  assert.match(transportRunner, /JSON\.stringify\(\(await db\.collection\('studentFinance'\)/);
  assert.match(transportRunner, /db\.collection\('payments'\)\.where\('studentId', '==', editStudent\)/);
  assert.doesNotMatch(runner, /\b(?:setDoc|updateDoc|deleteDoc)\(/);
});

test('fixture prefix and exact run identity are mandatory', () => {
  assert.equal(FIXTURE_PREFIX, 'payment-lots123-production-');
  assert.equal(fixtureSchoolIdFor('123456-1'), 'payment-lots123-production-123456-1');
  assert.equal(assertFixtureSchoolId('payment-lots123-production-123456-1', '123456-1'),
    'payment-lots123-production-123456-1');
});

test('italo-gsb, known real schools and arbitrary IDs are denied', () => {
  for (const schoolId of ['italo-gsb', 'school-alpha-001', 'transport-release-production-123456-1',
    'payment-lots123-production-foreign']) {
    assert.throws(() => assertFixtureSchoolId(schoolId, '123456-1'));
  }
});

test('config requires backup receipt, exact SHA and deployment gates', () => {
  assert.equal(validateProductionLotsConfig(validEnv()).fixtureSchoolId,
    'payment-lots123-production-123456-1');
  for (const mutate of [
    (env) => { env.GITHUB_SHA = 'b'.repeat(40); },
    (env) => { env.PAYMENT_LOTS123_DEPLOYMENT_VERIFIED = 'false'; },
    (env) => { env.PAYMENT_LOTS123_CLEANUP_CAPABILITY_VERIFIED = 'false'; },
    (env) => { env.PAYMENT_LOTS123_PROJECT_ID = 'ecoscolaire-staging'; },
    (env) => { env.PAYMENT_LOTS123_APP_URL = 'https://example.com'; },
    (env) => { env.PAYMENT_LOTS123_CONFIRMATION = 'wrong'; },
  ]) {
    const env = validEnv(); mutate(env); assert.throws(() => validateProductionLotsConfig(env));
  }
});

test('cleanup is exact, idempotent and preserves foreign studentFinance and counters', async () => {
  const manifest = createCleanupManifest({
    fixtureSchoolId: 'payment-lots123-production-123456-1', testRunId: '123456-1',
  });
  manifest.documents.get('studentFinance').add('fixture-student');
  const existing = new Set([
    'studentFinance/fixture-student', 'studentFinance/real-student',
    'counters/receipts_payment-lots123-production-123456-1', 'counters/receipts_italo-gsb',
  ]);
  const remove = async ({ collection, id }) => existing.delete(`${collection}/${id}`);
  await cleanupExactManifest(manifest, remove);
  await cleanupExactManifest(manifest, remove);
  assert.deepEqual([...existing].sort(), ['counters/receipts_italo-gsb', 'studentFinance/real-student']);
});

test('all residuals and orphans are mandatory zero', () => {
  const zero = Object.fromEntries([
    'students', 'studentPrivate', 'studentFinance', 'payments', 'receipts',
    'transportPaymentAllocations', 'financialBenefits', 'paymentMoratoriums',
    'cashClosures', 'cashLedgerDays', 'counters', 'authUsers', 'audit_logs',
    'residuals', 'orphans',
  ].map((name) => [name, 0]));
  assert.doesNotThrow(() => assertZeroResiduals(zero));
  assert.throws(() => assertZeroResiduals({ ...zero, counters: 1 }));
  assert.throws(() => assertZeroResiduals({ ...zero, orphans: 1 }));
});

test('financial fingerprints fail closed on every protected change', () => {
  const baseline = {
    classFees: 'a', annualAmounts: 'b', installmentAmounts: 'c', installmentCounts: 'd',
    deadlines: 'e', transportTariffs: 'f', collections: { students: { count: 1, fingerprint: 'g' } },
  };
  assert.equal(compareFinancialFingerprints(baseline, structuredClone(baseline)), true);
  const changed = structuredClone(baseline); changed.collections.students.fingerprint = 'changed';
  assert.throws(() => compareFinancialFingerprints(baseline, changed));
});

test('Production Tuition moratorium fixture uses canonical academic-year deadlines', () => {
  const valid = {
    academicYear: {
      name: PRODUCTION_LOTS123_ACADEMIC_YEAR,
      tuitionPaymentDeadlines: { ...PRODUCTION_LOTS123_TUITION_DEADLINES },
    },
    moratorium: { ...PRODUCTION_LOTS123_TUITION_MORATORIUM },
  };
  assert.equal(assertProductionTuitionMoratoriumFixture(valid), true);
  assert.deepEqual(PRODUCTION_LOTS123_TUITION_QUOTE, {
    grossExpectedAmount: 40_000,
    originalDueDate: '2026-09-15',
    effectiveDueDate: '2026-12-15',
  });

  assert.throws(() => assertProductionTuitionMoratoriumFixture({
    ...valid, academicYear: { name: PRODUCTION_LOTS123_ACADEMIC_YEAR },
  }));
  assert.throws(() => assertProductionTuitionMoratoriumFixture({
    ...valid,
    moratorium: { academicYear: PRODUCTION_LOTS123_ACADEMIC_YEAR, type: 'tuition', installment: 'T1',
      status: 'approved', effectiveDueDate: '2026-12-15' },
  }));
});

test('Production Tuition moratorium fixture fails closed on target drift', () => {
  const academicYear = {
    name: PRODUCTION_LOTS123_ACADEMIC_YEAR,
    tuitionPaymentDeadlines: { ...PRODUCTION_LOTS123_TUITION_DEADLINES },
  };
  const mutate = (changes) => ({ ...PRODUCTION_LOTS123_TUITION_MORATORIUM, ...changes });
  for (const moratorium of [
    mutate({ installment: 'T2' }),
    mutate({ academicYear: '2026-2027' }),
    mutate({ effectiveDueDate: '2026-12-16' }),
  ]) {
    assert.throws(() => assertProductionTuitionMoratoriumFixture({ academicYear, moratorium }));
  }
});

test('Production runner consumes the validated Tuition fixture contract before writes', () => {
  const contractIndex = transportRunner.indexOf('assertProductionTuitionMoratoriumFixture({');
  const firstWriteIndex = transportRunner.indexOf("await createMarked('schools'");
  assert.ok(contractIndex >= 0 && contractIndex < firstWriteIndex);
  assert.match(transportRunner, /tuitionPaymentDeadlines: \{ \.\.\.PRODUCTION_LOTS123_TUITION_DEADLINES \}/);
  assert.match(transportRunner, /\.\.\.tuitionMoratoriumFixture/);
  assert.doesNotMatch(transportRunner, /type: 'tuition', installment: 'T1', status: 'approved'/);
});

test('workflow is dispatch-only, Production-scoped and backup-gated before fixtures', () => {
  assert.match(workflow, /^on:\r?\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /\npush:/);
  assert.match(workflow, /environment: Production/);
  assert.match(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /credentials_json/);
  assert.ok(workflow.indexOf('verify-production-backup-gate.mjs')
    < workflow.indexOf('Run one isolated Production Lots 1-3 validation'));
  assert.ok(workflow.indexOf('Fail-closed exact main, Firebase and Vercel SHA gate')
    < workflow.indexOf('Run one isolated Production Lots 1-3 validation'));
  assert.ok(workflow.indexOf('verify-exact-deployment-run.mjs')
    < workflow.indexOf('vercel-production-deployment-gate.mjs'));
  assert.ok(workflow.indexOf('vercel-production-deployment-gate.mjs')
    < workflow.indexOf('Authenticate to approved Production identity'));
  assert.ok(workflow.indexOf('Authenticate to approved Production identity')
    < workflow.indexOf('verify-production-backup-gate.mjs'));
  assert.ok(workflow.indexOf('verify-production-backup-gate.mjs')
    < workflow.indexOf('Guard exact fixture lifecycle permissions before Chromium'));
  assert.ok(workflow.indexOf('Guard exact fixture lifecycle permissions before Chromium')
    < workflow.indexOf('Run one isolated Production Lots 1-3 validation'));
  assert.ok(workflow.indexOf('Guard exact fixture lifecycle permissions before Chromium')
    < workflow.indexOf('Install Chromium'));
  assert.doesNotMatch(workflow, /map\(select\(\.sha[\s\S]*\| first \| \.id/);
});

test('workflow preserves exact project, fixture, counter and WIF contracts', () => {
  assert.match(workflow, /PAYMENT_LOTS123_PROJECT_ID: ecoscolaire-c5861/);
  assert.match(workflow, /PRODUCTION_FIREBASE_PROJECT_ID: ecoscolaire-c5861/);
  assert.match(workflow, /payment-lots123-production-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /WORKLOAD_IDENTITY_PROVIDER/);
  assert.match(workflow, /SERVICE_ACCOUNT/);
  assert.doesNotMatch(workflow, /firebaseauth\.users\.update/);
  assert.doesNotMatch(workflow, /roles\/(owner|editor|firebaseauth\.admin|datastore\.user)/i);
});

test('workflow wires every required post-backup runner configuration value', () => {
  for (const expected of [
    /PRODUCTION_FIREBASE_PROJECT_ID: ecoscolaire-c5861/,
    /PAYMENT_LOTS123_PROJECT_ID: ecoscolaire-c5861/,
    /GOOGLE_CLOUD_PROJECT: ecoscolaire-c5861/,
    /PAYMENT_LOTS123_APP_URL: https:\/\/ecoscolaire\.vercel\.app/,
    /PAYMENT_LOTS123_EXPECTED_MAIN_SHA: \$\{\{ inputs\.expected_main_sha \}\}/,
    /PAYMENT_LOTS123_CONFIRMATION: \$\{\{ inputs\.confirmation \}\}/,
    /PAYMENT_LOTS123_TEST_RUN_ID: \$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
    /PAYMENT_LOTS123_FIXTURE_SCHOOL_ID: payment-lots123-production-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
    /PRODUCTION_BACKUP_OPERATIONS_PATH: \$\{\{ runner\.temp \}\}\/firestore-operations\.json/,
    /PRODUCTION_BACKUP_RECEIPT_PATH: \$\{\{ runner\.temp \}\}\/production-backup-receipt\.json/,
    /PRODUCTION_BACKUP_MAX_AGE_HOURS: \$\{\{ inputs\.backup_max_age_hours \}\}/,
    /workload_identity_provider: \$\{\{ secrets\.WORKLOAD_IDENTITY_PROVIDER \}\}/,
    /service_account: \$\{\{ secrets\.SERVICE_ACCOUNT \}\}/,
    /VITE_FIREBASE_API_KEY: \$\{\{ secrets\.VITE_FIREBASE_API_KEY \}\}/,
    /VITE_FIREBASE_AUTH_DOMAIN: \$\{\{ secrets\.VITE_FIREBASE_AUTH_DOMAIN \}\}/,
    /VITE_FIREBASE_PROJECT_ID: \$\{\{ secrets\.VITE_FIREBASE_PROJECT_ID \}\}/,
    /VITE_FIREBASE_STORAGE_BUCKET: \$\{\{ secrets\.VITE_FIREBASE_STORAGE_BUCKET \}\}/,
    /VITE_FIREBASE_MESSAGING_SENDER_ID: \$\{\{ secrets\.VITE_FIREBASE_MESSAGING_SENDER_ID \}\}/,
    /VITE_FIREBASE_APP_ID: \$\{\{ secrets\.VITE_FIREBASE_APP_ID \}\}/,
  ]) assert.match(workflow, expected);
  assert.match(workflow, /PAYMENT_LOTS123_DEPLOYMENT_VERIFIED=true/);
  assert.match(workflow, /PAYMENT_LOTS123_CLEANUP_CAPABILITY_VERIFIED=true/);
});

test('runner contains explicit Lot 1, Lot 2 and Lot 3 runtime coverage', () => {
  for (const expected of [
    'LOT123 Class 85K', 'LOT123 Class 120K', 'LOT123 Class 2 installments',
    '[40_000, 30_000, 15_000]', '[60_000, 40_000, 20_000]',
    'GROSS_AMOUNT_NOT_CONFIGURED', 'PERCENTAGE', 'Lots123 tuition moratorium',
    'transportNeighborhood', 'transportPickupPoint', 'financeBeforeEdit', 'paymentsBeforeEdit',
    'FREE_SECONDARY', 'transportCredit', 'allocationSummary', 'Receipt Privacy',
  ]) assert.match(transportRunner, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('runner forbids wildcard/global deletion and requires school-scoped cleanup', () => {
  assert.doesNotMatch(runner, /recursiveDelete|deleteCollection|collectionGroup|\*\/|wildcard/i);
  assert.match(transportRunner, /cfg\.isPaymentLots123[\s\S]*where\('schoolId', '==', schoolId\)/);
  assert.match(runner, /counters: new Set\(\[`receipts_\$\{fixtureSchoolId\}`\]\)/);
});

test('PR CI exposes the Production Lots 1-3 runner safety gate without continue-on-error', () => {
  assert.match(ci, /Production Lots 1.?3 runner safety/);
  assert.match(ci, /payment-lots123-production-runner\.spec\.mjs/);
  assert.doesNotMatch(ci, /continue-on-error/);
});

test('PR CI installs canonical root dependencies before mandatory runner safety', () => {
  const installIndex = ci.indexOf('name: Install root dependencies');
  const npmCiIndex = ci.indexOf('run: npm ci', installIndex);
  const runnerSafetyIndex = ci.indexOf('name: Production Lots 1-3 runner safety');
  assert.ok(installIndex >= 0 && npmCiIndex > installIndex, 'Canonical npm ci step is required.');
  assert.ok(npmCiIndex < runnerSafetyIndex, 'Root dependencies must be installed before runner safety.');
  assert.match(ci.slice(runnerSafetyIndex),
    /node --check scripts\/vercel-production-deployment-gate\.mjs/);
  assert.match(ci.slice(runnerSafetyIndex),
    /tests\/security\/vercel-production-deployment-gate\.spec\.mjs/);
  assert.doesNotMatch(ci.slice(runnerSafetyIndex), /test-payment-lots123-production\.mjs\s*(?:--execute|--run)?\s*$/m);
  assert.doesNotMatch(ci, /continue-on-error|\|\| true/);
});
