import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync(new URL('../../.github/workflows/run-seed.yml', import.meta.url), 'utf8');
const runner = fs.readFileSync(new URL('../../scripts/test-attendance-staging.mjs', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../../src/pages/Attendance.tsx', import.meta.url), 'utf8');

test('Attendance UI is backend-first and contains no direct student attendance merge', () => {
  const callable = page.indexOf('await recordStudentAttendance(');
  const localUpdate = page.indexOf('updateAttendanceLocal(response.attendance)');
  assert.ok(callable >= 0 && localUpdate > callable);
  assert.doesNotMatch(page, /safeMergeDB/);
  assert.doesNotMatch(page, /crypto\.randomUUID/);
});

test('Attendance E2E is Staging-only, fixture-tagged, responsive and exact-cleaned', () => {
  assert.match(workflow, /- attendance-e2e/);
  assert.match(workflow, /attendance-e2e:[\s\S]*environment: staging/);
  assert.match(workflow, /attendance-e2e:[\s\S]*VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.match(runner, /EXPECTED_PROJECT = 'ecoscolaire-staging'/);
  assert.match(runner, /testFixture: true, testRunId/);
  assert.match(runner, /recordStudentAttendance/);
  assert.match(runner, /RESPONSIVE: 360, 768, 1440/);
  assert.match(runner, /residuals=\$\{residuals\} orphans=\$\{orphans\}/);
  assert.doesNotMatch(runner, /ecoscolaire-c5861/);
});
