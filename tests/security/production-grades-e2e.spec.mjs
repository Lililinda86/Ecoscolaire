import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync(new URL('../../scripts/test-grades-staging.mjs', import.meta.url), 'utf8');
const audit = fs.readFileSync(new URL('../../scripts/audit-grades-production-readonly.mjs', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/production-grades-e2e.yml', import.meta.url), 'utf8');

test('Production Grades smoke is manual, main-only, exact-SHA and project guarded', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s{2}push:/m);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /RUN_ITALO_GRADES_PRODUCTION_SMOKE/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /ecoscolaire-c5861/);
  assert.match(workflow, /ecoscolaire-staging/);
  for (const name of ['manageEvaluation', 'recordGradesBatch', 'manageTeacherAssignment', 'publishClassProgramDraft', 'manageAcademicPeriod']) {
    assert.ok(workflow.includes(name), `Missing Production Function guard: ${name}`);
  }
});

test('Production Grades smoke uses keyless bounded fixtures and exact cleanup', () => {
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.doesNotMatch(workflow, /SERVICE_ACCOUNT.*KEY|service.account.*json/i);
  assert.match(script, /ITALO-PROD-GRADE-TEST-/);
  assert.match(script, /testFixture: true, testRunId/);
  assert.match(script, /where\('testRunId', '==', testRunId\)/);
  assert.match(script, /Refusing cleanup of non-fixture/);
  assert.match(script, /describeRealDataChanges\(realBefore, await snapshotRealData\(\)\)/);
  assert.match(script, /CONCURRENT REAL USER ACTIVITY/);
  assert.match(script, /Release-generated real-data residuals/);
  assert.match(script, /auth\/user-not-found/);
  assert.match(script, /firestoreResiduals=0 authResiduals=0 orphans=0/);
});

test('Production Grades smoke covers lifecycle, validation, security, direct writes and responsive UI', () => {
  for (const marker of [
    'CREATE_DRAFT', "action: 'OPEN'", "action: 'LOCK'", "action: 'PUBLISH'", "action: 'CANCEL'",
    'Number.NaN', 'Number.POSITIVE_INFINITY', 'INVALID_SCORE', 'DUPLICATE_STUDENT', 'STUDENT_NOT_ELIGIBLE',
    'IDEMPOTENCY_CONFLICT', 'Promise.allSettled', 'EVALUATION_OWNERSHIP_REQUIRED',
    'setDoc(', 'updateDoc(', 'deleteDoc(',
    'width: 360', 'width: 768', 'width: 1440', 'Aucune période ouverte',
  ]) assert.ok(script.includes(marker), `Missing Grades safety coverage: ${marker}`);
});

test('Production Grades smoke proves zero automatic pedagogical side effects', () => {
  assert.match(script, /programsAutoCreated=0 periodsAutoCreated=0 teacherAssignmentsAutoCreated=0 reportCardsCreated=0/);
  for (const name of ['reportCards', 'classPrograms', 'periods', 'teacherAssignments']) assert.ok(script.includes(`'${name}'`));
  assert.match(script, /unexpected automatic side effects/);
});

test('Production Grades baseline is PII-free and treats unmarked documents as real', () => {
  assert.match(audit, /piiPrinted: false/);
  assert.match(audit, /documentId/);
  assert.match(audit, /updateTime/);
  assert.match(audit, /studentId/);
  assert.match(audit, /data\.testFixture === true.*data\.testRunId/s);
  assert.doesNotMatch(audit, /email|password|phone|address/);
});