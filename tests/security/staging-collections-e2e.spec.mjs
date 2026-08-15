import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../../.github/workflows/run-seed.yml', import.meta.url);
const scriptUrl = new URL('../../scripts/test-secretary-collections-staging.mjs', import.meta.url);

test('live collections E2E is staging-only and uses environment-scoped secrets', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /secretary-collections-e2e:[\s\S]*environment:\s*staging/);
  assert.match(workflow, /STAGING_TEST_ALPHA_PASSWORD:\s*\$\{\{ secrets\.STAGING_TEST_ALPHA_PASSWORD \}\}/);
  assert.match(workflow, /STAGING_FIREBASE_SERVICE_ACCOUNT:\s*\$\{\{ secrets\.STAGING_FIREBASE_SERVICE_ACCOUNT \}\}/);
  assert.match(workflow, /VERCEL_AUTOMATION_BYPASS_SECRET:\s*\$\{\{ secrets\.VERCEL_AUTOMATION_BYPASS_SECRET \}\}/);
  assert.match(workflow, /run:\s*node scripts\/test-secretary-collections-staging\.mjs/);
  assert.doesNotMatch(workflow, /PRODUCTION_FIREBASE|PRODUCTION_TEST|production-service-account/i);
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
  assert.match(source, /finally \{[\s\S]*CLEANUP: deleting only exact E2E fixture records/);
  assert.match(source, /STAGING FIXTURE CLEANUP: PASS/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:PASSWORD|SERVICE_ACCOUNT|API_KEY)/);
});
