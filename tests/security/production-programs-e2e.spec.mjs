import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync(new URL('../../scripts/test-programs-staging.mjs', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/production-programs-e2e.yml', import.meta.url), 'utf8');
const ensureDraft = fs.readFileSync(new URL('../../functions/src/academic/ensureClassProgramDraft.ts', import.meta.url), 'utf8');

test('Production Programs smoke is manual, main-only, exact-SHA and project guarded', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s{2}push:/m);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /RUN_ITALO_PROGRAMS_PRODUCTION_SMOKE/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /ecoscolaire-c5861/);
  assert.match(workflow, /ecoscolaire-staging/);
  for (const name of ['ensureClassProgramDraft', 'updateClassProgramDraft', 'publishClassProgramDraft', 'archiveClassProgram']) {
    assert.ok(workflow.includes(name), `Missing Programs Function guard: ${name}`);
  }
});

test('Production Programs smoke uses bounded fixtures, exact cleanup and live real-data fingerprints', () => {
  assert.match(script, /ITALO-PROD-PROGRAM-TEST-/);
  assert.match(script, /testFixture: true, testRunId/);
  assert.match(script, /where\('testRunId', '==', testRunId\)/);
  assert.match(script, /describeRealDataChanges\(realBefore, await snapshotRealData\(\)\)/);
  assert.match(script, /CONCURRENT REAL ACTIVITY/);
  assert.match(script, /Release-generated real-data residuals/);
  assert.match(script, /where\('programId', '==', expectedProgramId\)/);
  assert.match(script, /Refusing cleanup of non-fixture classSubject/);
  assert.match(ensureDraft, /program\.testFixture === true \? \{ testFixture: true as const, testRunId: program\.testRunId \}/);
  assert.match(script, /auth\/user-not-found/);
  assert.match(script, /residuals=0 orphans=0 authResiduals=0/);
  assert.doesNotMatch(script, /italo-gsb/);
});

test('Production Programs smoke covers lifecycle, revisions, validation, RBAC, direct-write denial and responsive UI', () => {
  for (const marker of [
    "'superAdmin', 'owner', 'director', 'secretary', 'teacher', 'parent', 'student', 'boardViewer'",
    'Number.NaN', 'missing-fixture-subject', 'inactiveSubject', 'already-exists',
    'Promise.allSettled', 'publishedRevisionNumber', 'archive(',
    'setDoc(', 'updateDoc(', 'deleteDoc(',
    'width: 360', 'width: 768', 'width: 1440',
  ]) assert.ok(script.includes(marker), `Missing safety coverage: ${marker}`);
});

test('Production Programs smoke proves zero automatic pedagogical side effects and PII-free audits', () => {
  for (const name of ['teacherAssignments', 'evaluations', 'grades', 'reportCards', 'periods']) {
    assert.ok(script.includes(`'${name}'`), `Missing zero-side-effect assertion: ${name}`);
  }
  assert.match(script, /!\/email\|password\|student\|payment\|receipt\/i/);
});
