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
  assertProductionTuitionMoratoriumFixture, assertProductionChildResult,
  extractChildFailureMarker, validateProductionLotsConfig,
} from '../../scripts/test-payment-lots123-production.mjs';
import {
  buildStudentPrivateTransportAuditUpdate, expectFailure, paymentFailureMarker,
  redactDiagnosticText, safeErrorSnapshot,
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

const failureContext = (overrides = {}) => ({
  scenarioId: 'LOT1_TWO_INSTALLMENT_T3_DENY',
  lot: 1,
  operation: 'getCollectionQuote tuition T3',
  expectedCodes: ['GROSS_AMOUNT_NOT_CONFIGURED'],
  metadata: { studentId: 'payment-lots123-production-student' },
  ...overrides,
});

test('expected Firebase and callable failures still resolve successfully', async () => {
  await assert.doesNotReject(() => expectFailure(failureContext(), async () => {
    throw { code: 'functions/failed-precondition', details: { businessCode: 'GROSS_AMOUNT_NOT_CONFIGURED' } };
  }));
  await assert.doesNotReject(() => expectFailure(failureContext({
    scenarioId: 'LOT2_PARENT_WRITE_DENY', lot: 2,
    operation: 'parent update students usesTransport', expectedCodes: ['permission-denied'],
  }), async () => {
    throw { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
  }));
});

test('Lot 1 and Lot 2 unexpected failures retain distinct context, stack and cause', async () => {
  const cases = [
    [failureContext(), 'raw tuition T3 network failure'],
    [failureContext({
      scenarioId: 'LOT2_PARENT_WRITE_DENY', lot: 2,
      operation: 'parent update students usesTransport', expectedCodes: ['permission-denied'],
    }), 'raw parent write failure'],
  ];
  for (const [context, message] of cases) {
    const original = new Error(message, { cause: new Error('inner cause') });
    await assert.rejects(() => expectFailure(context, async () => { throw original; }), (error) => {
      assert.equal(error.name, 'ExpectedFailureDiagnosticError');
      assert.equal(error.code, 'EXPECT_FAILURE_MISMATCH');
      assert.equal(error.scenarioId, context.scenarioId);
      assert.equal(error.cause, original);
      assert.match(error.message, new RegExp(`scenarioId=${context.scenarioId}`));
      assert.match(error.message, new RegExp(`expectedCodes=${context.expectedCodes[0]}`));
      assert.match(error.message, new RegExp(message));
      assert.match(error.message, /originalStack=Error:/);
      assert.deepEqual(error.originalError.cause.name, 'Error');
      return true;
    });
  }
});

test('unexpected JavaScript rejection shapes always produce useful diagnostics', async () => {
  const assertion = new assert.AssertionError({ message: 'inner assertion', actual: 1, expected: 0 });
  const shapes = [
    new Error('plain error'),
    assertion,
    { message: 'message-only object' },
    'string rejection',
    null,
    undefined,
    new Error('outer error', { cause: new Error('nested cause') }),
  ];
  for (const shape of shapes) {
    await assert.rejects(() => expectFailure(failureContext(), async () => { throw shape; }), (error) => {
      assert.equal(error.code, 'EXPECT_FAILURE_MISMATCH');
      assert.match(error.message, /errorName=/);
      assert.match(error.message, /errorMessage=/);
      assert.match(error.message, /originalStack=/);
      assert.ok(error.originalError);
      return true;
    });
  }
});

test('diagnostic output redacts credentials, tokens, cookies and passwords', async () => {
  const original = new Error('token=top-secret Authorization: Bearer abc.def password=hunter2');
  original.details = { cookie: 'session-value', nested: { credential: 'credential-value', safe: 'fixture-id' } };
  original.code = 'internal';
  await assert.rejects(() => expectFailure(failureContext({
    metadata: { schoolId: 'payment-lots123-production-123-1', secret: 'metadata-secret' },
  }), async () => { throw original; }), (error) => {
    const marker = JSON.stringify(paymentFailureMarker(error));
    const snapshot = JSON.stringify(error.originalError);
    for (const secret of ['top-secret', 'abc.def', 'hunter2', 'session-value', 'credential-value', 'metadata-secret']) {
      assert.doesNotMatch(`${error.message}\n${marker}\n${snapshot}`, new RegExp(secret.replace('.', '\\.')));
    }
    assert.match(error.message, /\[REDACTED\]/);
    assert.match(error.message, /payment-lots123-production-123-1/);
    assert.doesNotMatch(redactDiagnosticText('cookie=session-value'), /session-value/);
    return true;
  });
});

test('safe error snapshots retain Firebase metadata and sanitize causes', () => {
  const error = new Error('callable failed');
  error.code = 'functions/internal';
  error.details = { businessCode: 'BACKEND_FAILURE', token: 'secret-token' };
  error.cause = new Error('password=hidden');
  const snapshot = safeErrorSnapshot(error);
  assert.equal(snapshot.code, 'functions/internal');
  assert.equal(snapshot.businessCode, 'BACKEND_FAILURE');
  assert.equal(snapshot.details.token, '[REDACTED]');
  assert.doesNotMatch(JSON.stringify(snapshot.cause), /hidden/);
});

test('parent reports child exit details and requires the final completion marker', () => {
  assert.equal(assertProductionChildResult({
    status: 0, signal: null, stdout: 'PAYMENT_LOTS123_CHECKPOINT PAYMENT_LOTS123_COMPLETE\n', stderr: '',
  }), true);
  const marker = { scenarioId: 'LOT1_TWO_INSTALLMENT_T3_DENY', lot: 1, errorCode: 'EXPECT_FAILURE_MISMATCH' };
  assert.throws(() => assertProductionChildResult({
    status: 1, signal: null, stdout: '', stderr: `PAYMENT_LOTS123_FAILURE ${JSON.stringify(marker)}\n`,
  }), (error) => {
    assert.equal(error.code, 'CHILD_RUNNER_FAILED');
    assert.equal(error.childExitCode, 1);
    assert.equal(error.childFailure.scenarioId, marker.scenarioId);
    assert.match(error.message, /exited with code 1/);
    assert.match(error.message, /See child diagnostic above/);
    return true;
  });
  assert.throws(() => assertProductionChildResult({ status: 0, signal: null, stdout: '', stderr: '' }),
    /without PAYMENT_LOTS123_COMPLETE/);
  assert.deepEqual(extractChildFailureMarker(`PAYMENT_LOTS123_FAILURE ${JSON.stringify(marker)}`), marker);
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
  assert.match(transportRunner, /LOT2_PARENT_WRITE_DENY[\s\S]*updateDoc\(doc\(parent\.firestore, 'students'/);
  assert.match(transportRunner, /LOT3_DIRECT_FINANCIAL_CREATE_DENY[\s\S]*setDoc\(doc\(secretary\.firestore, collection, directId\)/);
  assert.match(transportRunner, /LOT3_DIRECT_FINANCIAL_UPDATE_DENY[\s\S]*updateDoc\(doc\(secretary\.firestore, collection, id\)/);
  assert.match(transportRunner, /LOT3_DIRECT_FINANCIAL_DELETE_DENY[\s\S]*deleteDoc\(doc\(secretary\.firestore, collection, id\)/);
  assert.match(transportRunner, /LOT3_DIRECT_STUDENT_FINANCE_CREATE_DENY[\s\S]*setDoc\(doc\(client\.firestore, 'studentFinance'/);
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

test('authenticated Firebase clients are initialized and signed in before first use', () => {
  const credentialSetup = transportRunner.indexOf("await createFixtureUser('parent')");
  const clientSignIn = transportRunner.indexOf('await signInWithEmailAndPassword(auth, creds.email, creds.password)');
  const clientReturn = transportRunner.indexOf('return { app, auth, firestore: getFirestore(app)');
  assert.ok(credentialSetup >= 0, 'Parent fixture credentials must be created.');
  assert.ok(clientSignIn >= 0 && clientSignIn < clientReturn,
    'Every Firebase client must sign in before its Firestore client is returned.');

  const clients = [
    ['owner', "const owner = await newClient('owner')", 'call(owner'],
    ['secretary', "const secretary = await newClient('secretary')", 'call(secretary'],
    ['accountant', "const accountant = await newClient('accountant')", 'pay(accountant'],
    ['director', "const director = await newClient('director')", "['owner', owner], ['secretary', secretary], ['accountant', accountant], ['director', director]"],
    ['parent', "const parent = await newClient('parent')", 'doc(parent.firestore'],
    ['cross-school owner', "const crossOwner = await newClient('crossOwner')", 'doc(crossOwner.firestore'],
  ];
  for (const [actor, initializer, firstUse] of clients) {
    const initializationIndex = transportRunner.indexOf(initializer);
    const firstUseIndex = transportRunner.indexOf(firstUse, initializationIndex + initializer.length);
    assert.ok(initializationIndex > credentialSetup, `${actor} client must initialize after fixture credentials.`);
    assert.ok(firstUseIndex > initializationIndex, `${actor} client must initialize before first use.`);
  }
  assert.equal((transportRunner.match(/const parent = await newClient\('parent'\)/g) || []).length, 1,
    'The parent Firebase session must be initialized exactly once and reused.');
});

test('Lot 2 parent denial uses the authenticated parent client without privileged substitution', () => {
  const parentInitialization = transportRunner.indexOf("const parent = await newClient('parent')");
  const lot2Start = transportRunner.indexOf("checkpoint('LOT2_START')");
  const scenarioStart = transportRunner.indexOf("scenarioId: 'LOT2_PARENT_WRITE_DENY'");
  const scenarioEnd = transportRunner.indexOf("checkpoint('LOT2_PARENT_DENY_PASS')", scenarioStart);
  assert.ok(parentInitialization >= 0 && parentInitialization < lot2Start && lot2Start < scenarioStart,
    'Parent must be signed in before the Lot 2 denial scenario starts.');

  const scenario = transportRunner.slice(scenarioStart, scenarioEnd);
  assert.match(scenario, /expectedCodes: \['permission-denied'\]/);
  assert.match(scenario,
    /updateDoc\(doc\(parent\.firestore, 'students', editStudent\), \{ usesTransport: false \}\)/);
  assert.doesNotMatch(scenario, /\bdb\.collection\(|adminAuth|secretary\.firestore/,
    'The parent Rules denial cannot use Admin SDK or secretary credentials.');
  assert.match(transportRunner, /await createFixtureUser\('parent'\);/,
    'The parent actor must use the same-school fixture default.');
});
test('every expected-failure callsite has unique explicit diagnostic context', () => {
  const callsites = transportRunner.match(/expectFailure\(\{/g) || [];
  const labelledContexts = transportRunner.match(/expectFailure\(\{[\s\S]*?scenarioId(?:\s*:|\s*,)/g) || [];
  assert.equal(callsites.length, 15);
  assert.equal(labelledContexts.length, callsites.length);

  const runtimeScenarioIds = [...transportRunner.matchAll(/['"](LOT[123]_[A-Z0-9_]+_DENY)['"]/g)]
    .map((match) => match[1]);
  assert.equal(runtimeScenarioIds.length, 17);
  assert.equal(new Set(runtimeScenarioIds).size, runtimeScenarioIds.length);
  for (const required of ['LOT1_TWO_INSTALLMENT_T3_DENY', 'LOT2_PARENT_WRITE_DENY',
    'LOT3_CROSS_SCHOOL_PAYMENT_DENY', 'LOT3_DIRECT_STUDENT_FINANCE_CREATE_DENY']) {
    assert.ok(runtimeScenarioIds.includes(required));
  }
});

test('expected-code vocabulary remains aligned with each API layer', () => {
  assert.match(transportRunner,
    /LOT1_TWO_INSTALLMENT_T3_DENY[\s\S]*expectedCodes: \['GROSS_AMOUNT_NOT_CONFIGURED'\]/);
  assert.match(transportRunner,
    /LOT2_PARENT_WRITE_DENY[\s\S]*expectedCodes: \['permission-denied'\]/);
  assert.match(transportRunner,
    /LOT3_CROSS_SCHOOL_PAYMENT_DENY[\s\S]*expectedCodes: \['CROSS_SCHOOL_DENIED'\]/);
  assert.match(transportRunner,
    /LOT3_SECRETARY_REVERSAL_DENY[\s\S]*expectedCodes: \['PERMISSION_DENIED'\]/);
  for (const scenario of ['LOT3_RECEIPT_PARENT_UNRELATED_DENY', 'LOT3_RECEIPT_PARENT_CROSS_SCHOOL_DENY',
    'LOT3_RECEIPT_CROSS_OWNER_DENY', 'LOT3_DIRECT_FINANCIAL_CREATE_DENY',
    'LOT3_DIRECT_FINANCIAL_UPDATE_DENY', 'LOT3_DIRECT_FINANCIAL_DELETE_DENY',
    'LOT3_DIRECT_STUDENT_FINANCE_CREATE_DENY']) {
    assert.match(transportRunner, new RegExp(`${scenario}[\\s\\S]*?expectedCodes: \\['permission-denied'\\]`));
  }
});

test('granular Lot checkpoints replace the premature coverage marker', () => {
  const markers = [
    'LOT1_START', 'LOT1_CLASSFEES_PASS', 'LOT1_T3_DENY_PASS', 'LOT1_BENEFIT_PASS',
    'LOT1_MORATORIUM_PASS', 'LOT1_PARTIAL_PASS', 'LOT1_COMPLETE',
    'LOT2_START', 'LOT2_STUDENTPRIVATE_UPDATE_PASS', 'LOT2_PARENT_DENY_PASS',
    'LOT2_PRIMARY_INCOMPLETE_PASS', 'LOT2_SECONDARY_FREE_PASS', 'LOT2_COMPLETE',
    'LOT3_START', 'LOT3_PK28_PASS', 'LOT3_PK35_PASS', 'LOT3_BENEFIT_PASS',
    'LOT3_ALLOCATIONS_PASS', 'LOT3_MORATORIUM_PASS', 'LOT3_RECEIPT_PASS', 'LOT3_COMPLETE',
    'PAYMENT_LOTS123_COMPLETE',
  ];
  for (const marker of markers) assert.match(transportRunner, new RegExp(`checkpoint\\('${marker}'\\)`));
  assert.doesNotMatch(transportRunner, /PAYMENT LOTS123 COVERAGE/);
  assert.ok(transportRunner.indexOf("checkpoint('LOT1_COMPLETE')")
    < transportRunner.indexOf("checkpoint('LOT2_START')"));
  assert.ok(transportRunner.indexOf("checkpoint('LOT2_COMPLETE')")
    < transportRunner.indexOf("checkpoint('LOT3_START')"));
  assert.ok(transportRunner.indexOf("checkpoint('LOT3_COMPLETE')")
    < transportRunner.indexOf("checkpoint('PAYMENT_LOTS123_COMPLETE')"));
  assert.ok(transportRunner.indexOf("checkpoint('PAYMENT_LOTS123_COMPLETE')")
    < transportRunner.indexOf('TRANSPORT RELEASE CONTRACT: PASS'));
  assert.match(runner, /assertProductionChildResult\(child\)/);
  assert.match(runner, /PAYMENT_LOTS123_CHECKPOINT PAYMENT_LOTS123_COMPLETE/);
  assert.doesNotMatch(runner, /assert\.equal\(child\.status, 0/);
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
