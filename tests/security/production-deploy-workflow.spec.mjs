import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/firebase-deploy.yml', import.meta.url);
const workflow = fs.readFileSync(workflowPath, 'utf8');

const requiredFunctions = new Set([
  'createStudentSecure',
  'enforceStudentSaasLimits',
  'initiatePayment',
  'campayWebhook',
  'onPaymentCreated',
  'updateStudentFinancialStatus',
  'recordCashPayment',
  'createTuitionDiscount',
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

test('Production deployment is main-only and guarded to ecoscolaire-c5861', () => {
  assert.match(workflow, /push:\s*\r?\n\s+branches:\s*\r?\n\s+- main/);
  assert.match(workflow, /FIREBASE_PROJECT_ID:\s*ecoscolaire-c5861/);
  assert.match(workflow, /\$FIREBASE_PROJECT_ID[^\r\n]*ecoscolaire-c5861/);
});

test('Production deployment includes Firestore Rules and the exact eight Functions', () => {
  assert.ok(deployTargets.includes('firestore:rules'));
  assert.deepEqual(deployedFunctions, requiredFunctions);
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
