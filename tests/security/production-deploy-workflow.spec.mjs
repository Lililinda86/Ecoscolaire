import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  evaluateFirebaseDeployResult,
  runFirebaseDeployFailClosed,
} from '../../scripts/run-firebase-deploy-fail-closed.mjs';

const workflowPath = new URL('../../.github/workflows/firebase-deploy.yml', import.meta.url);
const workflow = fs.readFileSync(workflowPath, 'utf8');
const mainRef = 'refs/heads/main';

const requiredFunctions = new Set([
  'createStudentSecure',
  'enforceStudentSaasLimits',
  'initiatePayment',
  'campayWebhook',
  'onPaymentCreated',
  'updateStudentFinancialStatus',
  'recordCashPayment',
  'reversePayment',
  'createTuitionDiscount',
  'approveTuitionDiscount',
  'createFinancialBenefit',
  'approveFinancialBenefit',
  'cancelFinancialBenefit',
  'getCollectionQuote',
  'closeCashDrawer',
  'getBoardViewerGovernanceSummary',
  'recordAuthenticatedAudit',
  'createExpense',
  'reverseExpense',
  'assignStudentToClass',
  'recordStudentAttendance',
  'manageStaff',
  'linkStaffToUser',
  'unlinkStaffFromUser',
  'manageAcademicPeriod',
]);

const requiredBoardViewerFunctions = new Set([
  'getBoardViewerGovernanceSummary',
  'recordAuthenticatedAudit',
]);

const forbiddenFunctions = new Set([
  'processStudentImportJob',
  'sweepZombieImportJobs',
]);

const deployCommand = workflow
  .split(/\r?\n/)
  .find(line => line.includes('firebase deploy --only'));

assert.ok(deployCommand, 'Production workflow must contain a Firebase deploy command.');

const onlyMatch = deployCommand.match(/--only\s+([^\s]+)\s+--project/);
assert.ok(onlyMatch, 'Production deploy command must expose an explicit --only manifest.');

const deployTargets = onlyMatch[1].split(',');
const deployedFunctions = new Set(
  deployTargets
    .filter(target => target.startsWith('functions:'))
    .map(target => target.slice('functions:'.length)),
);

const jobGuardMatch = workflow.match(
  /jobs:\s*\r?\n\s+deploy:\s*\r?\n\s+if:\s*github\.ref\s*==\s*'([^']+)'/,
);
const workflowDispatchRetained = /^\s{2}workflow_dispatch:\s*$/m.test(workflow);

const productionDeployJobEligible = (eventName, ref) => {
  const eventConfigured = eventName === 'push'
    || (eventName === 'workflow_dispatch' && workflowDispatchRetained);
  return eventConfigured && ref === jobGuardMatch?.[1];
};

test('Production deployment is main-only and guarded to ecoscolaire-c5861', () => {
  assert.match(workflow, /push:\s*\r?\n\s+branches:\s*\r?\n\s+- main/);
  assert.ok(workflowDispatchRetained);
  assert.equal(jobGuardMatch?.[1], mainRef);
  assert.match(workflow, /if \[ "\$GITHUB_REF" != "refs\/heads\/main" \]; then/);
  assert.match(workflow, /FIREBASE_PROJECT_ID:\s*ecoscolaire-c5861/);
  assert.match(workflow, /\$FIREBASE_PROJECT_ID[^\r\n]*ecoscolaire-c5861/);
});

test('Production deploy eligibility is fail-closed for every configured trigger', () => {
  assert.equal(productionDeployJobEligible('push', mainRef), true);
  assert.equal(productionDeployJobEligible('workflow_dispatch', mainRef), true);
  assert.equal(productionDeployJobEligible('workflow_dispatch', 'refs/heads/staging'), false);
  assert.equal(productionDeployJobEligible('workflow_dispatch', 'refs/heads/feature/example'), false);
});

test('Production deployment includes Firestore Rules and the exact twenty-five Functions', () => {
  assert.ok(deployTargets.includes('firestore:rules'));
  assert.deepEqual(deployedFunctions, requiredFunctions);
});

test('Production deployment manifest includes every BoardViewer-required Function', () => {
  for (const functionName of requiredBoardViewerFunctions) {
    assert.equal(
      deployedFunctions.has(functionName),
      true,
      `Production deployment manifest must include functions:${functionName}`,
    );
  }
});

test('Production deployment excludes import Functions and Storage Rules', () => {
  for (const functionName of forbiddenFunctions) {
    assert.equal(deployedFunctions.has(functionName), false);
  }
  assert.equal(deployTargets.some(target => target.includes('storage')), false);
});

test('Production workflow never injects staging test credentials', () => {
  assert.doesNotMatch(workflow, /STAGING_TEST_(?:ALPHA|BETA|SUPERADMIN)_PASSWORD/);
});

test('Production workflow executes Firebase through the fail-closed wrapper', () => {
  assert.match(
    deployCommand,
    /node scripts\/run-firebase-deploy-fail-closed\.mjs -- firebase deploy/,
  );
});

test('A simulated firebase deploy exit 1 fails the deployment logic', async () => {
  const sink = { write() {} };
  const result = await runFirebaseDeployFailClosed(
    process.execPath,
    ['-e', 'process.exit(1)'],
    { stdout: sink, stderr: sink },
  );

  assert.equal(result.exitCode, 1);
  assert.match(result.reason, /exited with code 1/);
});

test('A zero exit with a plain Firebase completion marker succeeds', () => {
  const result = evaluateFirebaseDeployResult(
    0,
    'Deploy complete!',
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.reason, null);
  assert.equal(result.completionMarkerFound, true);
});

test('A zero exit with an ANSI-colored Firebase completion marker succeeds', () => {
  const result = evaluateFirebaseDeployResult(
    0,
    '\u001b[32m\u001b[1m\u001b[4mDeploy complete!\u001b[24m\u001b[39m',
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.reason, null);
  assert.equal(result.completionMarkerFound, true);
});

test('A non-zero exit fails even when output misleadingly contains the marker', () => {
  const result = evaluateFirebaseDeployResult(
    1,
    '\u001b[32mDeploy complete!\u001b[39m',
  );

  assert.equal(result.exitCode, 1);
  assert.match(result.reason, /exited with code 1/);
  assert.equal(result.completionMarkerFound, true);
});

test('A zero exit without a completion marker remains a successful command', () => {
  const result = evaluateFirebaseDeployResult(0, 'functions source uploaded successfully');

  assert.equal(result.exitCode, 0);
  assert.equal(result.reason, null);
  assert.equal(result.completionMarkerFound, false);
});
