import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../../.github/workflows/run-seed.yml', import.meta.url);
const scriptUrl = new URL('../../scripts/test-secretary-collections-staging.mjs', import.meta.url);
const completionScriptUrl = new URL('../../scripts/test-secretary-collections-staging-completion.mjs', import.meta.url);

test('live collections E2E is staging-only and uses environment-scoped secrets', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /secretary-collections-e2e:[\s\S]*environment:\s*staging/);
  assert.match(workflow, /STAGING_TEST_ALPHA_PASSWORD:\s*\$\{\{ secrets\.STAGING_TEST_ALPHA_PASSWORD \}\}/);
  assert.match(workflow, /STAGING_FIREBASE_SERVICE_ACCOUNT:\s*\$\{\{ secrets\.STAGING_FIREBASE_SERVICE_ACCOUNT \}\}/);
  assert.match(workflow, /VERCEL_AUTOMATION_BYPASS_SECRET:\s*\$\{\{ secrets\.VERCEL_AUTOMATION_BYPASS_SECRET \}\}/);
  assert.match(workflow, /node scripts\/test-secretary-collections-staging\.mjs/);
  assert.match(workflow, /node scripts\/test-secretary-collections-staging-completion\.mjs/);
  assert.ok(
    workflow.indexOf('node scripts/test-secretary-collections-staging-completion.mjs')
      < workflow.indexOf('node scripts/test-secretary-collections-staging.mjs'),
    'Tuition deadlines must run before the secretary scenario that closes its fixture cash day.',
  );
  assert.doesNotMatch(workflow, /PRODUCTION_FIREBASE|PRODUCTION_TEST|production-service-account/i);
});

test('completion runner covers live financial schedules, reversals and exact cleanup', async () => {
  const source = await readFile(completionScriptUrl, 'utf8');

  assert.match(source, /EXPECTED_PROJECT = 'ecoscolaire-staging'/);
  assert.match(source, /PRODUCTION_PROJECT = 'ecoscolaire-c5861'/);
  assert.match(source, /serviceAccount\.project_id !== EXPECTED_PROJECT/);
  assert.match(source, /assertStagingRuntimeProject\(runtimeProject\)/);
  assert.match(source, /production requests=0/);
  assert.match(source, /testFixture: true, testRunId: suffix/);
  assert.match(source, /mode: 'PERCENTAGE'/);
  assert.match(source, /tuitionDiscounts/);
  assert.match(source, /paymentMoratoriums/);
  assert.match(source, /tuition-deadlines-staging-\$\{suffix\}/);
  assert.match(source, /tuition-deadlines-year-\$\{suffix\}/);
  assert.match(source, /tuition-deadlines-class-\$\{suffix\}/);
  assert.match(source, /e2e-tuition-secretary-\$\{suffix\}/);
  assert.match(source, /assertFixtureCashDayOpen/);
  assert.match(source, /assertFixtureCashLedgerOpen/);
  assert.match(source, /expectedCash/);
  assert.match(source, /status, 'closed'/);
  assert.match(source, /cashLedgerDayId/);
  assert.match(source, /markCashDayFixture/);
  assert.match(source, /cleanupCashDayFixture/);
  assert.match(source, /cashLedgerDays/);
  assert.match(source, /academicYears.*academicYearFixtureId.*exists, false/s);
  assert.match(source, /ownerReverseCall/);
  assert.match(source, /secretaryReverseCall/);
  assert.match(source, /otherOwnerReverseCall/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /width: 360/);
  assert.match(source, /width: 768/);
  assert.match(source, /width: 1440/);
  assert.match(source, /RESPONSIVE \$\{item\.width\}px FULL PAYMENT FLOW: PASS/);
  assert.match(source, /CASH CLOSURE EXPECTED/);
  assert.match(source, /STAGING COMPLETION RESIDUALS: 0/);
  assert.match(source, /STAGING COMPLETION ORPHANS: 0/);
  assert.match(source, /RECEIPT COUNTER REWOUND: NO/);
  assert.match(source, /finally \{[\s\S]*CLEANUP COMPLETE/);
  assert.match(source, /if \(cashLedgerDayId\) \{[\s\S]*cleanupCashDayFixture/);
  assert.doesNotMatch(source, /if \(closureId\) \{[\s\S]*cleanupCashDayFixture/);
  assert.doesNotMatch(source, /school-alpha-001|secretary\.alpha@ecoscolaire\.com/);
  assert.doesNotMatch(source, /firebase use|firebase deploy|ecoscolaire-c5861\.firebaseio\.com/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:PASSWORD|SERVICE_ACCOUNT|API_KEY)/);
});

test('runner fails closed against Production and always executes exact cleanup', async () => {
  const source = await readFile(scriptUrl, 'utf8');

  assert.match(source, /EXPECTED_PROJECT = 'ecoscolaire-staging'/);
  assert.match(source, /immutable Vercel Preview URL/);
  assert.match(source, /getByTestId\('diagnostic-firebase-project'\)/);
  assert.match(source, /assertProtectedPreviewLoaded/);
  assert.match(source, /'x-vercel-protection-bypass': process\.env\.VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.match(source, /'x-vercel-set-bypass-cookie': 'true'/);
  assert.match(source, /page\.route\(`\$\{appUrl\}\/\*\*`/);
  assert.match(source, /assertAutomationBypassSecret\(process\.env\.VERCEL_AUTOMATION_BYPASS_SECRET\)/);
  assert.doesNotMatch(source, /extraHTTPHeaders/);
  assert.doesNotMatch(source, /[?&]x-vercel-protection-bypass/);
  assert.match(source, /assertStagingRuntimeProject\(runtimeProject\)/);
  assert.match(source, /assertStagingFirebasePrecheck/);
  assert.match(source, /firestore\.googleapis\.com\/v1\/projects\/\$\{encodeURIComponent\(runtimeProject\)\}/);
  assert.match(source, /method: 'GET'/);
  assert.doesNotMatch(source, /getByText\(EXPECTED_PROJECT/);
  assert.doesNotMatch(source, /waitForTimeout/);
  assert.doesNotMatch(source, /EXPECTED_SCHOOL|school-alpha-001/);
  assert.match(source, /testSchoolId = String\(secretary\.schoolId/);
  assert.match(source, /schoolId: testSchoolId/);
  assert.match(source, /academicYears.*activeAcademicYearId/);
  assert.match(source, /httpsCallable\(functions, 'createStudentSecure'\)/);
  assert.match(source, /TRANSPORT_FREE_SECONDARY/);
  assert.match(source, /feePolicyId: 'ITALO_PK_2026'/);
  assert.match(source, /transportZonePk: zonePk/);
  assert.match(source, /e2e-transport-pk14/);
  assert.match(source, /e2e-transport-pk34/);
  assert.match(source, /kind: 'CREDIT'/);
  assert.match(source, /transportPaymentAllocations/);
  assert.match(source, /const boundedDrain = async/);
  assert.match(source, /cleanupCashDayFixture/);
  assert.match(source, /cashLedgerDay: 0/);
  assert.match(source, /testRunId.*suffix/);
  assert.match(source, /classId: secondaryClassId/);
  assert.match(source, /classId: primaryClassId/);
  assert.match(source, /studentMatriculeReservations/);
  assert.match(source, /studentDuplicateReservations/);
  assert.match(source, /if \(Number\.isSafeInteger\(schoolStudentsCountBefore\)\)/);
  assert.match(source, /e2e-academic-year-/);
  assert.match(source, /e2e-secondary-class-/);
  assert.match(source, /Refusing to restore an academic year pointer changed by another operation/);
  assert.match(source, /academicYearFixture: 0, secondaryClassFixture: 0/);
  assert.match(source, /finally \{[\s\S]*CLEANUP: deleting only exact E2E fixture records/);
  assert.match(source, /STAGING FIXTURE CLEANUP: PASS/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:PASSWORD|SERVICE_ACCOUNT|API_KEY)/);
});
