import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/production-staff-e2e.yml', 'utf8');
const script = readFileSync('scripts/test-staff-production.mjs', 'utf8');

test('Production Staff smoke is manual, main-only, exact-target and keyless', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+push:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /RUN_ITALO_STAFF_PRODUCTION_SMOKE/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$PRODUCTION_EXPECTED_SHA"/);
  assert.match(workflow, /ecoscolaire-c5861/);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.doesNotMatch(workflow, /credentials_json:/);
});

test('Production Staff smoke uses marked fixtures and exact finally cleanup', () => {
  assert.match(script, /ITALO-PROD-STAFF-TEST-/);
  assert.match(script, /testFixture: true, testRunId/);
  assert.match(script, /finally \{/);
  assert.match(script, /where\('testRunId', '==', testRunId\)/);
  assert.match(script, /assert\.equal\(document\.data\(\)\.testFixture, true\)/);
  assert.match(script, /assert\.deepEqual\(postInventory, preInventory\)/);
  assert.match(script, /CLEANUP residuals=0 orphans=0 authResiduals=0/);
  assert.match(script, /applicationDefault\(\)/);
  assert.doesNotMatch(script, /STAGING_FIREBASE_|STAGING_APP_URL/);
});

test('Production Staff PII check is scoped to canonical Staff audit events', () => {
  assert.match(script, /const requiredStaffAuditActions = \[/);
  assert.match(script, /STAFF_CREATED/);
  assert.match(script, /STAFF_USER_UNLINKED/);
  assert.match(script, /filter\(item => requiredStaffAuditActions\.includes\(String\(item\.action\)\)\)/);
  assert.match(script, /const auditJson = JSON\.stringify\(staffAuditDocuments\)/);
});
