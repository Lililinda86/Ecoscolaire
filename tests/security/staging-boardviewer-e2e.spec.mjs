import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createPhaseErrorTracker } from '../../scripts/test-boardviewer-staging.mjs';

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
  assert.match(runner, /canonicalBackendAudit/);
  assert.match(runner, /where\('testRunId', '==', suffix\)/);
});

test('BoardViewer gate covers deployed privacy, callable and responsive UI', () => {
  assert.match(runner, /privacyPayload\.school\.activeAcademicYearId = '\[ALLOWED_SCHOOL_CONFIG_ID\]'/);
  for (const marker of [
    'DEPLOYED RULES: PASS',
    'AGGREGATE CALLABLE: PASS',
    'BOARDVIEWER LOGIN/LOGOUT/DASHBOARD: PASS',
    'OWNER UI REGRESSION: PASS',
    'SECRETARY UI REGRESSION: PASS',
    'SECRETARY COLLECTIONS REGRESSION: PASS',
    'CREATE DENY: PASS',
    'UPDATE DENY: PASS',
    'DELETE DENY: PASS',
    'APPROVE DENY: PASS',
    'PRIVATE STUDENT DENY: PASS',
    'PRIVATE STAFF DENY: PASS',
    'RAW FINANCE DENY: PASS',
    'CROSS-SCHOOL DENY: PASS',
    'NOTIFICATION SECURITY: PASS',
    'VALIDATION REQUEST SECURITY: PASS',
    'AUDIT LOG CREATE DENY: PASS',
    'BACKEND LOGIN AUDIT: PASS',
    'BACKEND LOGOUT AUDIT: PASS',
    'OWNER BACKEND SESSION AUDIT: PASS',
    'SECRETARY BACKEND SESSION AUDIT: PASS',
    'INACTIVE USER AUDIT: DENY',
    'MISSING PROFILE AUDIT: DENY',
    'FORGED AUDIT IDENTITY: DENY',
    'ARBITRARY AUDIT EVENT: DENY',
    'MOBILE 360',
    'TABLET 768',
    'DESKTOP 1440',
  ]) assert.match(runner, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(runner, /'recordAuthenticatedAudit'/);
});

test('diagnostic errors cannot populate the BoardViewer dashboard bucket', () => {
  const tracker = createPhaseErrorTracker();
  tracker.record('console', { pageUrl: 'https://preview.example/#/diagnostic', message: 'FirebaseError: permission-denied' });
  tracker.beginPhase('boardviewer');

  assert.equal(tracker.issuesFor('precheck').length, 1);
  assert.deepEqual(tracker.issuesFor('boardviewer'), []);
  tracker.assertNoUnexpected('boardviewer', 'dashboard');
});

test('a BoardViewer dashboard permission error fails the gate', () => {
  const tracker = createPhaseErrorTracker();
  tracker.beginPhase('boardviewer');
  tracker.record('console', { pageUrl: 'https://preview.example/#/', message: 'FirebaseError: Missing or insufficient permissions.' });

  assert.throws(
    () => tracker.assertNoUnexpected('boardviewer', 'dashboard'),
    /FirebaseError: Missing or insufficient permissions/,
  );
});

test('a BoardViewer dashboard pageerror fails the gate', () => {
  const tracker = createPhaseErrorTracker();
  tracker.beginPhase('boardviewer');
  tracker.record('pageerror', { pageUrl: 'https://preview.example/#/', message: 'uncaught dashboard exception' });

  assert.throws(
    () => tracker.assertNoUnexpected('boardviewer', 'dashboard'),
    /uncaught dashboard exception/,
  );
});

test('BoardViewer collection is reset immediately before login and captures HTTP context', () => {
  assert.match(runner,
    /browserIssues\.beginPhase\('boardviewer'\);\s*await page\.goto\(`\$\{appUrl\}\/\#\/login`/);
  for (const field of ['pageUrl', 'requestUrl', 'method', 'status', 'resourceType']) {
    assert.match(runner, new RegExp(`${field}:`));
  }
  assert.match(runner, /response\.status\(\) < 400/);
  assert.match(runner, /classification: activePhase === 'precheck' \? 'EXPECTED_PRECHECK' : 'UNEXPECTED'/);
});
