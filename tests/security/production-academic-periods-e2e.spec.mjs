import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync(new URL('../../scripts/test-academic-periods-production.mjs', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/production-academic-periods-e2e.yml', import.meta.url), 'utf8');

test('Production Academic Periods smoke is manual, main-only, exact-SHA and project guarded', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s{2}push:/m);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /RUN_ITALO_PERIODS_PRODUCTION_SMOKE/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /ecoscolaire-c5861/);
  assert.match(workflow, /ecoscolaire-staging/);
});

test('Production Academic Periods smoke uses bounded fixtures and exact cleanup', () => {
  assert.match(script, /ITALO-PROD-PERIOD-TEST-/);
  assert.match(script, /testFixture: true, testRunId/);
  assert.match(script, /where\('testRunId', '==', testRunId\)/);
  assert.match(script, /assert\.deepEqual\(await snapshotRealData\(db\), realBefore\)/);
  assert.match(script, /residuals=0 orphans=0/);
  assert.doesNotMatch(script, /2026-2027/);
});

test('Production Academic Periods smoke covers lifecycle, validation, RBAC and direct-write denial', () => {
  for (const marker of [
    "action: 'CREATE'", "action: 'UPDATE'", "action: 'OPEN'", "action: 'CLOSE'",
    'invalid-range', 'outside-year', 'overlap', 'duplicate-order', 'Adjacent-',
    "'owner', 'director', 'secretary', 'teacher', 'parent', 'student', 'boardViewer'",
    'setDoc(', 'updateDoc(', 'deleteDoc(',
  ]) assert.ok(script.includes(marker), `Missing safety coverage: ${marker}`);
});

test('Production Academic Periods smoke proves zero pedagogical side effects and PII-free audits', () => {
  assert.match(script, /collection\('evaluations'\).*size, 0/s);
  assert.match(script, /collection\('grades'\).*size, 0/s);
  assert.match(script, /collection\('reportCards'\).*size, 0/s);
  assert.match(script, /!\('email' in item\.data\(\)\).*!\('name' in item\.data\(\)\)/);
});
