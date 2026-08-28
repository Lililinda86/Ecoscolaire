import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { expectedTransportReleaseRef, validateTransportReleaseRef, validateTransportRunnerConfig } from '../../scripts/transport-release-runner-contract.mjs';

const workflow = await readFile('.github/workflows/transport-payments-release-runner.yml', 'utf8');
const runner = await readFile('scripts/test-transport-payments-production.mjs', 'utf8');
const stagingWorkflow = await readFile('.github/workflows/run-seed.yml', 'utf8');
const environmentEvidenceSource = await readFile('scripts/test-transport-payments-production.mjs', 'utf8');
const environmentEvidence = new Function('assert', `${environmentEvidenceSource
  .match(/export const assertTransportEnvironmentEvidence = [\s\S]*?\n};(?=\nconst REQUIRED_FUNCTIONS)/)[0]
  .replace('export ', '')}; return assertTransportEnvironmentEvidence;`)(assert);

const valid = (mode = 'staging') => {
  const project = mode === 'production' ? 'ecoscolaire-c5861' : 'ecoscolaire-staging';
  const testRunId = '12345678-1';
  return {
    TRANSPORT_RELEASE_MODE: mode, TRANSPORT_FIREBASE_PROJECT_ID: project, GOOGLE_CLOUD_PROJECT: project,
    TRANSPORT_TEST_FIXTURE: 'true', TRANSPORT_REQUIRED_FUNCTIONS_VERIFIED: 'true',
    TRANSPORT_CLEANUP_CAPABILITY_VERIFIED: 'true', TRANSPORT_TEST_RUN_ID: testRunId,
    TRANSPORT_FIXTURE_SCHOOL_ID: `transport-release-${mode}-${testRunId}`,
    TRANSPORT_APP_URL: mode === 'production' ? 'https://ecoscolaire.vercel.app'
      : 'https://ecoscolaire-abc123-linda-lemofouet-s-projects.vercel.app',
    TRANSPORT_FIREBASE_API_KEY: 'fixture', TRANSPORT_FIREBASE_AUTH_DOMAIN: 'fixture',
    TRANSPORT_FIREBASE_STORAGE_BUCKET: 'fixture', TRANSPORT_FIREBASE_MESSAGING_SENDER_ID: 'fixture',
    TRANSPORT_FIREBASE_APP_ID: 'fixture', VERCEL_AUTOMATION_BYPASS_SECRET: 'fixture',
  };
};

const environment = (overrides = {}) => ({
  expectedProject: 'ecoscolaire-staging', runtimeProjectId: 'ecoscolaire-staging', networkProjectIds: [], ...overrides,
});

test('legacy environment evidence accepts authoritative Staging runtime with empty network', () => {
  assert.equal(environmentEvidence(environment()).runtimeProjectId, 'ecoscolaire-staging');
});

test('legacy environment evidence accepts matching Staging network IDs', () => {
  assert.deepEqual(environmentEvidence(environment({
    networkProjectIds: ['ecoscolaire-staging'],
  })).networkProjectIds, ['ecoscolaire-staging']);
});

for (const [name, overrides] of [
  ['Production runtime with Staging expected', { runtimeProjectId: 'ecoscolaire-c5861' }],
  ['Production network with Staging runtime', { networkProjectIds: ['ecoscolaire-c5861'] }],
  ['missing authoritative runtime with empty network', { runtimeProjectId: '' }],
  ['runtime and network conflict', { networkProjectIds: ['other-project'] }],
]) test(`legacy environment evidence fails closed: ${name}`, () => {
  assert.throws(() => environmentEvidence(environment(overrides)));
});

test('runner accepts only exact staging and production contracts', () => {
  assert.equal(validateTransportRunnerConfig(valid('staging')).expectedProject, 'ecoscolaire-staging');
  assert.equal(validateTransportRunnerConfig(valid('production')).expectedProject, 'ecoscolaire-c5861');
});

test('release ref contract fails closed by mode', () => {
  assert.equal(expectedTransportReleaseRef('production'), 'refs/heads/main');
  assert.equal(expectedTransportReleaseRef('staging'), 'refs/heads/staging');
  assert.doesNotThrow(() => validateTransportReleaseRef('production', 'refs/heads/main'));
  assert.throws(() => validateTransportReleaseRef('production', 'refs/heads/staging'));
  assert.doesNotThrow(() => validateTransportReleaseRef('staging', 'refs/heads/staging'));
  assert.throws(() => validateTransportReleaseRef('staging', 'refs/heads/main'));
  assert.throws(() => validateTransportReleaseRef('unknown', 'refs/heads/main'));
  assert.throws(() => validateTransportReleaseRef('staging', undefined));
  assert.match(workflow, /if \[ "\$TRANSPORT_RELEASE_MODE" = production \]; then[\s\S]*expected_ref='refs\/heads\/main'/);
  assert.match(workflow, /elif \[ "\$TRANSPORT_RELEASE_MODE" = staging \]; then[\s\S]*expected_ref='refs\/heads\/staging'/);
  assert.match(workflow, /test "\$GITHUB_REF" = "\$expected_ref"/);
  assert.doesNotMatch(workflow, /expected_ref="refs\/heads\/\$\{TRANSPORT_RELEASE_MODE\}"/);
});

for (const [name, mutate] of [
  ['wrong projectId', (env) => { env.TRANSPORT_FIREBASE_PROJECT_ID = 'ecoscolaire-c5861'; }],
  ['missing testRunId', (env) => { delete env.TRANSPORT_TEST_RUN_ID; }],
  ['testFixture missing', (env) => { delete env.TRANSPORT_TEST_FIXTURE; }],
  ['real ITALO school requested', (env) => { env.TRANSPORT_FIXTURE_SCHOOL_ID = 'italo-gsb'; }],
  ['production target in staging mode', (env) => { env.TRANSPORT_APP_URL = 'https://ecoscolaire.vercel.app'; }],
  ['required Function unavailable', (env) => { env.TRANSPORT_REQUIRED_FUNCTIONS_VERIFIED = 'false'; }],
  ['cleanup contract unavailable', (env) => { env.TRANSPORT_CLEANUP_CAPABILITY_VERIFIED = 'false'; }],
]) test(`fail-closed before writes: ${name}`, () => {
  const env = valid('staging'); mutate(env);
  assert.throws(() => validateTransportRunnerConfig(env));
});

test('workflow is manual, branch-bound, keyless in Production and verifies lifecycle IAM', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+push:/);
  assert.match(workflow, /refs\/heads\/staging/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /workload_identity_provider/);
  assert.match(workflow, /testIamPermissions/);
  for (const permission of ['datastore.entities.delete', 'firebaseauth.users.delete']) assert.match(workflow, new RegExp(permission));
  assert.doesNotMatch(workflow, /production-financial-e2e|test-production-financial-e2e/);
});

test('runner is isolated, run-scoped, manifests exact IDs and baselines real data', () => {
  assert.match(runner, /REAL_ITALO_SCHOOL = 'italo-gsb'/);
  assert.match(runner, /assert\.notEqual\(cfg\.fixtureSchoolId, REAL_ITALO_SCHOOL\)/);
  assert.doesNotMatch(runner, /doc\(REAL_ITALO_SCHOOL\)\.get\(\)/);
  assert.match(runner, /credentialKey = role === 'owner' && schoolId === otherSchoolId \? 'crossOwner' : role/);
  assert.match(runner, /email = `\$\{credentialKey\}-\$\{cfg\.testRunId\}@example\.invalid`/);
  assert.match(runner, /testFixture: true, testRunId: cfg\.testRunId/);
  assert.match(runner, /const manifest =/);
  assert.match(runner, /snapshotInventory/);
  assert.match(runner, /compareInventory/);
  assert.match(runner, /releaseCaused=0/);
  assert.match(runner, /residuals=0 orphans=0/);
  assert.doesNotMatch(runner, /recursiveDelete|deleteCollection|where\('testFixture', '==', true\)/);
  assert.match(runner, /collection\('transportReleasePreflight'\)/);
  assert.doesNotMatch(runner, /collection\('__transport_release_preflight__'\)/);
});

test('runner covers the required Transport contract and real UI', () => {
  for (const token of [
    'pk14', 'pk33', 'pk34', 'pk42', 'FREE_SECONDARY', 'allocation4000', 'allocation5000',
    'partialRemaining', 'transportCredit', 'fixed-scholarship', 'percent-scholarship',
    'full-scholarship', 'fixed-discount', 'percent-discount', 'voucher', 'wrong-scope',
    'expired', 'moratorium', 'idempotentReplay', 'Promise.allSettled', 'reversePayment',
    'closeCashDrawer', 'CROSS_SCHOOL_DENIED', 'permission-denied', '#/payments',
  ]) assert.ok(runner.includes(token), `missing contract token ${token}`);
  for (const marker of ['benefit-approval-pk20', 'approval-fixed', 'benefit-approval-pk34',
    'approval-percent', 'TRANSPORT_FREE_SECONDARY', 'TRANSPORT_ZONE_REQUIRED',
    'TRANSPORT_ZONE_OUTSIDE_POLICY']) assert.ok(runner.includes(marker), `missing approval marker ${marker}`);
  assert.match(runner, /\[4_000, 1_000, 3_000\]/);
  assert.match(runner, /\[5_000, 2_500, 2_500\]/);
  assert.match(runner, /\[360, 768, 1440\]/);
  for (const token of ['amountMatrix', 'assertPaymentBalance', 'matrix-\$\{tariff\}-\$\{amount\}', 'periods\.map']) {
    assert.ok(runner.includes(token), `missing amount matrix token ${token}`);
  }
  assert.match(runner, /allocated \+ \(payment\.transportCredit \|\| 0\), amount/);
});

test('existing Staging dispatcher runs the isolated gate before the full collections E2E', () => {
  const isolatedIndex = stagingWorkflow.indexOf('node scripts/test-transport-payments-production.mjs');
  const fullIndex = stagingWorkflow.indexOf('node scripts/test-secretary-collections-staging.mjs');
  assert.ok(isolatedIndex > 0 && fullIndex > isolatedIndex);
  assert.match(stagingWorkflow, /inputs\.operation == 'secretary-collections-e2e'/);
  assert.match(stagingWorkflow, /project_id: ecoscolaire-staging/);
  assert.match(stagingWorkflow, /refs\/heads\/staging/);
  assert.match(stagingWorkflow, /testIamPermissions/);
  assert.match(stagingWorkflow, /TRANSPORT_FIXTURE_SCHOOL_ID: transport-release-staging-/);
  assert.doesNotMatch(stagingWorkflow, /TRANSPORT_FIXTURE_SCHOOL_ID: italo-gsb/);
});
