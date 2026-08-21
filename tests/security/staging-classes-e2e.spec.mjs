import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync(new URL('../../.github/workflows/run-seed.yml', import.meta.url), 'utf8');
const runner = fs.readFileSync(new URL('../../scripts/test-classes-staging.mjs', import.meta.url), 'utf8');

test('Classes E2E is Staging-only, protected-preview aware, fixture tagged and exact-cleaned', () => {
  assert.match(workflow, /- classes-e2e/);
  assert.match(workflow, /classes-e2e:[\s\S]*environment: staging/);
  assert.match(workflow, /classes-e2e:[\s\S]*VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.match(runner, /EXPECTED_PROJECT = 'ecoscolaire-staging'/);
  assert.match(runner, /testFixture: true, testRunId: suffix/);
  assert.match(runner, /assignStudentToClass/);
  assert.match(runner, /RESPONSIVE: Classes at 360, 768 and 1440/);
  assert.match(runner, /residuals=\$\{residuals\} orphans=\$\{orphans\}/);
  assert.doesNotMatch(runner, /ecoscolaire-c5861/);
});
