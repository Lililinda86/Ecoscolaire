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
  assert.match(workflow, /run:\s*node scripts\/test-secretary-collections-staging\.mjs/);
  assert.doesNotMatch(workflow, /PRODUCTION_FIREBASE|PRODUCTION_TEST|production-service-account/i);
});

test('runner fails closed against Production and always executes exact cleanup', async () => {
  const source = await readFile(scriptUrl, 'utf8');

  assert.match(source, /EXPECTED_PROJECT = 'ecoscolaire-staging'/);
  assert.match(source, /FORBIDDEN_PROJECT = 'ecoscolaire-c5861'/);
  assert.match(source, /immutable Vercel Preview URL/);
  assert.match(source, /assert\.equal\(productionRequests, 0/);
  assert.match(source, /finally \{[\s\S]*CLEANUP: deleting only exact E2E fixture records/);
  assert.match(source, /STAGING FIXTURE CLEANUP: PASS/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:PASSWORD|SERVICE_ACCOUNT|API_KEY)/);
});
