import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile('.github/workflows/production-financial-e2e.yml', 'utf8');
const runner = await readFile('scripts/test-production-financial-e2e.mjs', 'utf8');

test('Production financial E2E is manual, environment-protected and fail-closed', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+push:/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /RUN_ITALO_FINANCIAL_E2E/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /PRODUCTION_FIREBASE_PROJECT_ID:\s*ecoscolaire-c5861/);
  assert.match(workflow, /PRODUCTION_SCHOOL_ID:\s*italo-gsb/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
});

test('runner uses only marked temporary identities and never persists the generated passwords', () => {
  assert.match(runner, /ITALO-PROD-FIN-TEST-/);
  assert.match(runner, /crypto\.randomBytes\(32\)/);
  assert.match(runner, /@example\.invalid/);
  assert.match(runner, /adminAuth\.createUser/);
  assert.match(runner, /adminAuth\.deleteUser/);
  assert.doesNotMatch(runner, /console\.(?:log|error)\([^\n]*(?:secretaryPassword|ownerPassword)/);
  assert.doesNotMatch(workflow, /PASSWORD:\s*\$\{\{/i);
});

test('runner exercises the real UI and the authoritative Production callables', () => {
  assert.match(runner, /#\/students/);
  assert.match(runner, /Ajouter un élève/);
  assert.match(runner, /#\/payments/);
  assert.match(runner, /Enregistrer l'encaissement/);
  assert.match(runner, /academicYears.*school\.activeAcademicYearId/);
  for (const callable of [
    'createFinancialBenefit', 'approveFinancialBenefit', 'getCollectionQuote',
    'recordCashPayment', 'closeCashDrawer'
  ]) assert.match(runner, new RegExp(`'${callable}'`));
  assert.match(runner, /Promise\.allSettled/);
  assert.match(runner, /idempotentReplay/);
  assert.match(runner, /TRANSPORT_NOT_AVAILABLE_FOR_CLASS/);
  assert.match(runner, /classId: secondaryClassId/);
  assert.match(runner, /classId: primaryClassId/);
  assert.match(runner, /ecoscolaire-staging/);
});

test('cleanup is exact, mandatory and cannot rewind receipt numbers', () => {
  assert.match(runner, /\}\s*finally\s*\{/);
  assert.match(runner, /CLEANUP: exact TEST fixture IDs only/);
  assert.match(runner, /studentMatriculeReservations/);
  assert.match(runner, /studentDuplicateReservations/);
  assert.match(runner, /studentParentPrivate/);
  assert.match(runner, /studentParentFinance/);
  assert.match(runner, /CLEANUP RESIDUALS: 0/);
  assert.match(runner, /postInventory\.counts, preInventory\.counts/);
  assert.doesNotMatch(runner, /lastReceiptNumber\s*:/);
  assert.doesNotMatch(runner, /recursiveDelete|deleteCollection/);
});

