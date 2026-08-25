import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync(new URL('../../scripts/test-teacher-assignments-staging.mjs', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/production-teacher-assignments-e2e.yml', import.meta.url), 'utf8');

test('Production Teacher Assignments smoke is manual, main-only, exact-SHA and project guarded', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s{2}push:/m);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /RUN_ITALO_TEACHER_ASSIGNMENTS_PRODUCTION_SMOKE/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /ecoscolaire-c5861/);
  assert.match(workflow, /ecoscolaire-staging/);
  assert.match(workflow, /manageTeacherAssignment/);
  assert.match(workflow, /recordStudentAttendance/);
});

test('Production smoke uses bounded fixtures and proves exact cleanup of Firestore and Auth', () => {
  for (const marker of [
    'ITALO-PROD-TEACHER-ASSIGNMENT-TEST-', 'testFixture: true, testRunId',
    "where('testRunId', '==', testRunId)", 'snapshotRealData', 'snapshotRealAuth',
    'realDocumentsModified=0', 'realDocumentsDeleted=0', 'realAuthModified=0',
    'auth/user-not-found',
  ]) assert.ok(script.includes(marker), `Missing Production safety marker: ${marker}`);
  assert.doesNotMatch(script, /italo-gsb/);
});

test('Production smoke covers lifecycle, validation, RBAC, direct-write denial and responsive UI', () => {
  for (const marker of [
    'CREATE_DRAFT', 'UPDATE_DRAFT', 'ACTIVATE', 'DEACTIVATE',
    'SUBJECT_NOT_IN_PUBLISHED_PROGRAM', 'PROGRAM_NOT_PUBLISHED', 'TEACHER_LINK_REQUIRED',
    "'teacher', 'parent', 'student', 'driver', 'boardViewer'",
    "'teacherAssignments'", "'teacherAssignmentSlots'", 'setDoc(', 'updateDoc(', 'deleteDoc(',
    'width: 360', 'width: 768', 'width: 1440',
  ]) assert.ok(script.includes(marker), `Missing safety coverage: ${marker}`);
});

test('Production smoke fingerprints all protected academic collections', () => {
  for (const name of [
    'teacherAssignments', 'teacherAssignmentSlots', 'staff', 'users', 'classes', 'subjects',
    'classPrograms', 'periods', 'evaluations', 'grades', 'reportCards',
  ]) assert.ok(script.includes(`'${name}'`), `Missing protected collection: ${name}`);
});
