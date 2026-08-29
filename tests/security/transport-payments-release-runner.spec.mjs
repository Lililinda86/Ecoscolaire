import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { expectedTransportReleaseRef, validateTransportReleaseRef, validateTransportRunnerConfig } from '../../scripts/transport-release-runner-contract.mjs';
import { validateExactDeploymentRun } from '../../scripts/verify-exact-deployment-run.mjs';
import {
  formatInventorySummary, normalizeFunctionInventory, REQUIRED_STAGING_FUNCTIONS,
  validateFunctionInventory,
} from '../../scripts/verify-staging-function-deployment-contract.mjs';

const readText = async (path) => (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
const workflow = await readText('.github/workflows/transport-payments-release-runner.yml');
const runner = await readText('scripts/test-transport-payments-production.mjs');
const stagingWorkflow = await readText('.github/workflows/run-seed.yml');
const stagingDeploymentWorkflow = await readText('.github/workflows/deploy-staging.yml');
const environmentEvidenceSource = await readText('scripts/test-transport-payments-production.mjs');
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
  assert.ok(workflow.includes("projects\\.vercel\\.app"));
  assert.ok(!workflow.includes("projects\\\\.vercel\\\\.app"));
});

for (const [name, mutate] of [
  ['wrong projectId', (env) => { env.TRANSPORT_FIREBASE_PROJECT_ID = 'ecoscolaire-c5861'; }],
  ['missing testRunId', (env) => { delete env.TRANSPORT_TEST_RUN_ID; }],
  ['testFixture missing', (env) => { delete env.TRANSPORT_TEST_FIXTURE; }],
  ['real ITALO school requested', (env) => { env.TRANSPORT_FIXTURE_SCHOOL_ID = 'italo-gsb'; }],
  ['production target in staging mode', (env) => { env.TRANSPORT_APP_URL = 'https://ecoscolaire.vercel.app'; }],
  ['mutable staging alias', (env) => { env.TRANSPORT_APP_URL = 'https://ecoscolaire-git-staging-linda-lemofouet-s-projects.vercel.app'; }],
  ['wrong Vercel project', (env) => { env.TRANSPORT_APP_URL = 'https://ecoscolaire-abc123-other-projects.vercel.app'; }],
  ['missing URL', (env) => { env.TRANSPORT_APP_URL = ''; }],
  ['malformed URL', (env) => { env.TRANSPORT_APP_URL = 'not-a-url'; }],
  ['unexpected host', (env) => { env.TRANSPORT_APP_URL = 'https://example.com'; }],
  ['required Function unavailable', (env) => { env.TRANSPORT_REQUIRED_FUNCTIONS_VERIFIED = 'false'; }],
  ['cleanup contract unavailable', (env) => { env.TRANSPORT_CLEANUP_CAPABILITY_VERIFIED = 'false'; }],
]) test(`fail-closed before writes: ${name}`, () => {
  const env = valid('staging'); mutate(env);
  assert.throws(() => validateTransportRunnerConfig(env));
});

const requiredFixturePermissions = [
  'datastore.entities.create', 'datastore.entities.get', 'datastore.entities.list',
  'datastore.entities.update', 'datastore.entities.delete', 'firebaseauth.users.create',
  'firebaseauth.users.get', 'firebaseauth.users.delete',
];

test('workflow is manual, branch-bound, keyless in Staging and Production, and verifies lifecycle IAM', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+push:/);
  assert.match(workflow, /refs\/heads\/staging/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /permissions:\n\s+actions: read\n\s+contents: read\n\s+id-token: write/);
  assert.match(workflow, /workload_identity_provider: projects\/411364288790\/locations\/global\/workloadIdentityPools\/italo-transport-staging\/providers\/github-ecoscolaire-staging/);
  assert.match(workflow, /service_account: italo-transport-runner-staging@ecoscolaire-staging\.iam\.gserviceaccount\.com/);
  assert.doesNotMatch(workflow, /credentials_json/);
  assert.doesNotMatch(workflow, /STAGING_FIREBASE_SERVICE_ACCOUNT/);
  assert.match(workflow, /testIamPermissions/);
  for (const permission of requiredFixturePermissions) assert.match(workflow, new RegExp(permission));
  assert.doesNotMatch(workflow, /production-financial-e2e|test-production-financial-e2e/);
});

test('IAM preflight curl uses single-backslash line continuation and keeps its full contract', () => {
  const iamCurlMatch = workflow.match(/response="\$\(curl --fail --silent --show-error[\s\S]*?testIamPermissions"\)"/);
  assert.ok(iamCurlMatch, 'IAM preflight curl block not found');
  const iamCurl = iamCurlMatch[0];
  assert.doesNotMatch(iamCurl, /\\\\/);
  assert.match(iamCurl, /\\\n\s+-H "Authorization: Bearer \$token"/);
  assert.match(iamCurl, /\\\n\s+-d '\{"permissions":/);
  assert.match(iamCurl, /-H "Authorization: Bearer \$token" -H 'Content-Type: application\/json'/);
  assert.match(iamCurl, /-d '\{"permissions":\["datastore\.entities\.create"/);
  assert.match(iamCurl, /"https:\/\/cloudresourcemanager\.googleapis\.com\/v1\/projects\/\$\{TRANSPORT_FIREBASE_PROJECT_ID\}:testIamPermissions"\)"/);
});

test('IAM preflight collects every missing fixture lifecycle permission before failing closed', () => {
  const iamBlockMatch = workflow.match(/testIamPermissions"\)"\n[\s\S]*?TRANSPORT_CLEANUP_CAPABILITY_VERIFIED=true' >> "\$GITHUB_ENV"/);
  assert.ok(iamBlockMatch, 'IAM preflight permission-check block not found');
  const iamBlock = iamBlockMatch[0];
  assert.match(iamBlock, /missing_permissions=\(\)/);
  assert.match(iamBlock, /required_permissions=\(\n(?:\s+[a-z]+(?:\.[a-z]+)+\n){8}\s+\)/);
  assert.match(iamBlock, /for permission in "\$\{required_permissions\[@\]\}"; do/);
  for (const permission of requiredFixturePermissions) assert.ok(iamBlock.includes(permission), `missing permission token ${permission}`);
  assert.match(iamBlock, /missing_permissions\+=\("\$permission"\)/);
  assert.doesNotMatch(iamBlock, /\|\| \{ echo "Missing fixture lifecycle permission: \$permission"; exit 1; \}/);
  assert.match(iamBlock, /if \[ "\$\{#missing_permissions\[@\]\}" -gt 0 \]; then/);
  assert.match(iamBlock, /echo 'Missing fixture lifecycle permissions:'/);
  assert.match(iamBlock, /for permission in "\$\{missing_permissions\[@\]\}"; do/);
  assert.match(iamBlock, /echo "- \$permission"/);
  assert.equal((iamBlock.match(/exit 1/g) || []).length, 1);
  assert.match(iamBlock, /jq -ce/);
  assert.match(iamBlock, /mapfile -t returned_permissions/);
  assert.match(iamBlock, /Expected fixture lifecycle permissions:/);
  assert.match(iamBlock, /Returned fixture lifecycle permissions:/);
});

test('IAM preflight requests exactly the eight fixture lifecycle permissions before fixture creation', () => {
  const payloadMatch = workflow.match(/-d '(\{"permissions":\[[^']+\]\})'/);
  assert.ok(payloadMatch, 'testIamPermissions request payload not found');
  assert.deepEqual(JSON.parse(payloadMatch[1]).permissions, requiredFixturePermissions);
  const preflightIndex = workflow.indexOf('testIamPermissions');
  const installIndex = workflow.indexOf('- name: Install dependencies');
  const fixtureRunnerIndex = workflow.indexOf('node scripts/test-transport-payments-production.mjs');
  assert.ok(preflightIndex > 0 && preflightIndex < installIndex && installIndex < fixtureRunnerIndex);
});

const exactDeploymentSha = '6deb2e324822923aa8e4e6ee1a21942f952b26e6';
const oldDeploymentSha = '1111111111111111111111111111111111111111';
const deploymentRun = (overrides = {}) => ({
  conclusion: 'success', event: 'push', head_branch: 'staging', head_sha: exactDeploymentSha,
  id: 124, path: '.github/workflows/deploy-staging.yml', status: 'completed', ...overrides,
});
const validateDeployment = (workflowRuns) => validateExactDeploymentRun({ workflow_runs: workflowRuns }, {
  expectedBranch: 'staging', expectedSha: exactDeploymentSha,
  expectedWorkflowPath: '.github/workflows/deploy-staging.yml',
});

for (const [name, run] of [
  ['failed', deploymentRun({ conclusion: 'failure' })],
  ['pending', deploymentRun({ conclusion: null, status: 'in_progress' })],
  ['wrong SHA', deploymentRun({ head_sha: '2222222222222222222222222222222222222222' })],
  ['old successful SHA', deploymentRun({ head_sha: oldDeploymentSha })],
]) test(`exact-SHA deployment gate denies a ${name} Deploy Staging run`, () => {
  assert.throws(() => validateDeployment([run]));
});

test('exact-SHA deployment gate allows an exact successful Deploy Staging run', () => {
  assert.equal(validateDeployment([deploymentRun()]).id, 124);
});

test('runner queries GitHub Actions fail-closed for an exact deployment SHA', () => {
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /deployment_workflow='deploy-staging\.yml'/);
  assert.match(workflow, /gh api --method GET/);
  assert.match(workflow, /-f head_sha="\$GITHUB_SHA"/);
  assert.match(workflow, /-f branch="\$expected_branch"/);
  assert.match(workflow, /-f event=push/);
  assert.match(workflow, /verify-exact-deployment-run\.mjs/);
  assert.doesNotMatch(workflow, /gcloud functions list/);
  assert.doesNotMatch(workflow, /cloudfunctions\.functions\.list/);
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

const functionInventory = (generation = 'GEN_1', overrides = {}) => REQUIRED_STAGING_FUNCTIONS.map((name) => {
  const project = overrides.project || 'ecoscolaire-staging';
  const region = overrides.location || overrides.region || 'us-central1';
  return {
    name: `projects/${project}/locations/${region}/functions/${name}`,
    environment: generation, state: 'ACTIVE', ...overrides, logicalName: name,
  };
});

test('Staging deployment contract queries both generations and keeps the full Functions deployment', () => {
  assert.match(stagingDeploymentWorkflow, /firebase deploy --project .*--only functions,firestore:rules,storage/);
  assert.match(stagingDeploymentWorkflow, /gcloud functions list \\\n\s+--v2 \\\n\s+--project "\$FIREBASE_PROJECT_ID" \\\n\s+--regions us-central1 \\\n\s+--format=json \\\n\s+> \/tmp\/staging-functions-gen2\.json/);
  assert.doesNotMatch(stagingDeploymentWorkflow, /gcloud functions list --gen2/);
  assert.match(stagingDeploymentWorkflow, /verify-staging-function-deployment-contract\.mjs/);
  assert.doesNotMatch(workflow, /verify-staging-function-deployment-contract\.mjs/);
});

test('Staging deployment wires inventory collection and verification before Firebase deploy', () => {
  const installIndex = stagingDeploymentWorkflow.indexOf('Install Firebase CLI');
  const authIndex = stagingDeploymentWorkflow.indexOf('Authenticate to Google Cloud');
  const inventoryIndex = stagingDeploymentWorkflow.indexOf('Collect Staging Function inventories');
  const verifyIndex = stagingDeploymentWorkflow.indexOf('Verify Staging Function deployment contract');
  const deployIndex = stagingDeploymentWorkflow.indexOf('Deploy Firebase Backend');
  assert.ok(installIndex < authIndex && authIndex < inventoryIndex && inventoryIndex < verifyIndex && verifyIndex < deployIndex);
  assert.match(stagingDeploymentWorkflow, /gcloud functions list \\\n\s+--project "\$FIREBASE_PROJECT_ID" \\\n\s+--regions us-central1 \\\n\s+--format=json \\\n\s+> \/tmp\/staging-functions-gen1\.json/);
  assert.match(stagingDeploymentWorkflow, /gcloud functions list \\\n\s+--v2 \\\n\s+--project "\$FIREBASE_PROJECT_ID" \\\n\s+--regions us-central1 \\\n\s+--format=json \\\n\s+> \/tmp\/staging-functions-gen2\.json/);
  assert.doesNotMatch(stagingDeploymentWorkflow, /gcloud functions list \\\n\s+--gen2/);
  assert.match(stagingDeploymentWorkflow, /verify-staging-function-deployment-contract\.mjs \\\n\s+\/tmp\/staging-functions-gen1\.json \\\n\s+\/tmp\/staging-functions-gen2\.json \\\n\s+"\$FIREBASE_PROJECT_ID" \\\n\s+us-central1/);
});

test('Function inventory accepts all required Gen1, Gen2, and mixed records', () => {
  for (const inventory of [
    { gen1: functionInventory('GEN_1'), gen2: [] },
    { gen1: [], gen2: functionInventory('GEN_2') },
    { gen1: functionInventory('GEN_1').slice(0, 3), gen2: functionInventory('GEN_2').slice(3) },
  ]) assert.equal(validateFunctionInventory(inventory, { expectedProject: 'ecoscolaire-staging' }).pass, true);
});

test('Function inventory fails closed for missing, wrong region/project, inactive, empty, and duplicate cases', () => {
  const complete = { gen1: functionInventory('GEN_1'), gen2: [] };
  assert.deepEqual(validateFunctionInventory({ gen1: complete.gen1.filter(({ logicalName }) => logicalName !== 'approveFinancialBenefit') }, { expectedProject: 'ecoscolaire-staging' }).failures, ['approveFinancialBenefit']);
  assert.equal(validateFunctionInventory({ gen1: functionInventory('GEN_1', { location: 'europe-west1' }) }, { expectedProject: 'ecoscolaire-staging' }).pass, false);
  assert.equal(validateFunctionInventory({ gen1: functionInventory('GEN_1', { project: 'ecoscolaire-c5861' }) }, { expectedProject: 'ecoscolaire-staging' }).pass, false);
  assert.equal(validateFunctionInventory({ gen1: functionInventory('GEN_1', { state: 'ERROR' }) }, { expectedProject: 'ecoscolaire-staging' }).pass, false);
  assert.equal(validateFunctionInventory({ gen1: [], gen2: [] }, { expectedProject: 'ecoscolaire-staging' }).pass, false);
  assert.equal(validateFunctionInventory({ gen1: complete.gen1, gen2: functionInventory('GEN_2') }, { expectedProject: 'ecoscolaire-staging' }).pass, true);
});

test('Function inventory summary is limited to safe diagnostic fields', () => {
  const summary = formatInventorySummary(normalizeFunctionInventory({ gen1: [{ name: 'projects/ecoscolaire-staging/locations/us-central1/functions/approveFinancialBenefit', state: 'ACTIVE', secret: 'must-not-print' }] }));
  assert.match(summary, /approveFinancialBenefit\tGEN_1\tus-central1\tACTIVE/);
  assert.doesNotMatch(summary, /secret|must-not-print|ecoscolaire-c5861/);
});
