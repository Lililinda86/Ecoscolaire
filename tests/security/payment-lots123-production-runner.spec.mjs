import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  FIXTURE_PREFIX, assertFixtureSchoolId, assertZeroResiduals, cleanupExactManifest,
  compareFinancialFingerprints, createCleanupManifest, fixtureSchoolIdFor,
  validateProductionLotsConfig,
} from '../../scripts/test-payment-lots123-production.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const workflow = read('.github/workflows/payment-lots123-production-validation.yml');
const runner = read('scripts/test-payment-lots123-production.mjs');
const transportRunner = read('scripts/test-transport-payments-production.mjs');
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

test('workflow is dispatch-only, Production-scoped and backup-gated before fixtures', () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /\npush:/);
  assert.match(workflow, /environment: Production/);
  assert.match(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /credentials_json/);
  assert.ok(workflow.indexOf('verify-production-backup-gate.mjs')
    < workflow.indexOf('Run one isolated Production Lots 1-3 validation'));
  assert.ok(workflow.indexOf('Fail-closed exact main, Firebase and Vercel SHA gate')
    < workflow.indexOf('Run one isolated Production Lots 1-3 validation'));
  assert.ok(workflow.indexOf('Guard exact fixture lifecycle permissions before Chromium')
    < workflow.indexOf('Install Chromium'));
});

test('workflow preserves exact project, fixture, counter and WIF contracts', () => {
  assert.match(workflow, /PAYMENT_LOTS123_PROJECT_ID: ecoscolaire-c5861/);
  assert.match(workflow, /payment-lots123-production-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /WORKLOAD_IDENTITY_PROVIDER/);
  assert.match(workflow, /SERVICE_ACCOUNT/);
  assert.doesNotMatch(workflow, /firebaseauth\.users\.update/);
  assert.doesNotMatch(workflow, /roles\/(owner|editor|firebaseauth\.admin|datastore\.user)/i);
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
