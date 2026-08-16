import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync(new URL('../../.github/workflows/run-seed.yml', import.meta.url), 'utf8');
const runner = fs.readFileSync(new URL('../../scripts/test-boardviewer-staging.mjs', import.meta.url), 'utf8');

test('BoardViewer live E2E is a protected staging-only workflow operation', () => {
  assert.match(workflow, /- boardviewer-e2e/);
  assert.match(workflow, /boardviewer-e2e:[\s\S]*environment:\s*staging/);
  assert.match(workflow, /boardviewer-e2e:[\s\S]*STAGING_FIREBASE_SERVICE_ACCOUNT/);
  assert.match(workflow, /boardviewer-e2e:[\s\S]*VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.match(workflow, /boardviewer-e2e:[\s\S]*node scripts\/test-boardviewer-staging\.mjs/);
});

test('BoardViewer live E2E fails closed on Production routing', () => {
  assert.match(runner, /EXPECTED_PROJECT = 'ecoscolaire-staging'/);
  assert.match(runner, /serviceAccount\.project_id !== EXPECTED_PROJECT/);
  assert.match(runner, /assertStagingRuntimeProject\(runtimeProject\)/);
  assert.match(runner, /assertStagingFirebasePrecheck/);
  assert.doesNotMatch(runner, /ecoscolaire-c5861/);
});

test('BoardViewer fixtures use exact IDs and verify zero residuals', () => {
  assert.match(runner, /testFixture: true, testRunId: suffix/);
  assert.match(runner, /Refusing to delete non-fixture/);
  assert.match(runner, /Refusing to delete foreign fixture/);
  assert.match(runner, /assert\.deepEqual\(residualDocs, \[\]\)/);
  assert.match(runner, /assert\.deepEqual\(residualUsers, \[\]\)/);
  assert.match(runner, /STAGING ORPHANS: 0/);
});

test('BoardViewer gate covers deployed privacy, callable and responsive UI', () => {
  assert.match(runner, /privacyPayload\.school\.activeAcademicYearId = '\[ALLOWED_SCHOOL_CONFIG_ID\]'/);
  for (const marker of [
    'DEPLOYED RULES: PASS',
    'AGGREGATE CALLABLE: PASS',
    'BOARDVIEWER LOGIN/LOGOUT/DASHBOARD: PASS',
    'OWNER UI REGRESSION: PASS',
    'SECRETARY UI REGRESSION: PASS',
    'MOBILE 360',
    'TABLET 768',
    'DESKTOP 1440',
  ]) assert.match(runner, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
