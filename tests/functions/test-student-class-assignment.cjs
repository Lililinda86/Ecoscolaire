const assert = require('node:assert/strict');
const { handleAssignStudentToClass } = require('../../functions/lib/studentClassAssignment.js');

const users = new Map([
  ['super', { role: 'superAdmin', active: true }],
  ['owner-a', { role: 'owner', schoolId: 'school-a', active: true }],
  ['director-a', { role: 'director', schoolId: 'school-a', isActive: true }],
  ['secretary-a', { role: 'secretary', schoolId: 'school-a', status: 'active' }],
  ['teacher-a', { role: 'teacher', schoolId: 'school-a', active: true }],
  ['parent-a', { role: 'parent', schoolId: 'school-a', active: true }],
  ['board-a', { role: 'boardViewer', schoolId: 'school-a', active: true }],
  ['owner-b', { role: 'owner', schoolId: 'school-b', active: true }],
]);
const students = new Map([
  ['student-1', { id: 'student-1', schoolId: 'school-a', classId: 'class-a1', section: 'francophone', name: 'PII must not leak', phone: '600000000' }],
  ['student-legacy', { id: 'student-legacy', schoolId: 'school-a', classId: 'class-a1' }],
]);
const classes = new Map([
  ['class-a1', { id: 'class-a1', schoolId: 'school-a', section: 'francophone', isActive: true }],
  ['class-a2', { id: 'class-a2', schoolId: 'school-a', type: 'francophone' }],
  ['class-a3', { id: 'class-a3', schoolId: 'school-a', section: 'francophone', active: true }],
  ['class-en', { id: 'class-en', schoolId: 'school-a', section: 'anglophone', isActive: true }],
  ['class-inactive', { id: 'class-inactive', schoolId: 'school-a', isActive: false }],
  ['class-b', { id: 'class-b', schoolId: 'school-b', isActive: true }],
]);
const audits = new Map();
const serverTimestamp = Object.freeze({ trustedServerTimestamp: true });
let auditSequence = 0;
let transactionTail = Promise.resolve();

const dependencies = {
  newAuditId: () => `audit-${++auditSequence}`,
  serverTimestamp: () => serverTimestamp,
  nowIso: () => '2026-08-21T12:00:00.000Z',
  runTransaction: handler => {
    const operation = transactionTail.then(() => handler({
      getUser: async id => ({ exists: users.has(id), data: users.get(id) }),
      getStudent: async id => ({ exists: students.has(id), data: students.get(id) }),
      getClass: async id => ({ exists: classes.has(id), data: classes.get(id) }),
      updateStudent: (id, patch) => students.set(id, { ...students.get(id), ...structuredClone(patch) }),
      createAudit: (id, record) => audits.set(id, structuredClone(record)),
    }));
    transactionTail = operation.catch(() => undefined);
    return operation;
  },
};
const auth = uid => ({ uid });
const expectCode = (operation, code) => assert.rejects(operation, error => {
  assert.equal(error.code, code);
  return true;
});

(async () => {
  for (const [uid, targetClassId] of [
    ['owner-a', 'class-a2'], ['director-a', 'class-a1'], ['secretary-a', 'class-a2'], ['super', 'class-a1'],
  ]) {
    const result = await handleAssignStudentToClass({ studentId: 'student-legacy', targetClassId }, auth(uid), dependencies);
    assert.equal(result.success, true);
    assert.equal(students.get('student-legacy').classId, targetClassId);
  }

  for (const uid of ['teacher-a', 'parent-a', 'board-a']) {
    await expectCode(
      () => handleAssignStudentToClass({ studentId: 'student-1', targetClassId: 'class-a2' }, auth(uid), dependencies),
      'permission-denied',
    );
  }
  await expectCode(
    () => handleAssignStudentToClass({ studentId: 'student-1', targetClassId: 'class-a2' }, auth('owner-b'), dependencies),
    'permission-denied',
  );
  await expectCode(
    () => handleAssignStudentToClass({ studentId: 'student-1', targetClassId: 'class-b' }, auth('owner-a'), dependencies),
    'failed-precondition',
  );
  await expectCode(
    () => handleAssignStudentToClass({ studentId: 'student-1', targetClassId: 'class-inactive' }, auth('owner-a'), dependencies),
    'failed-precondition',
  );
  await expectCode(
    () => handleAssignStudentToClass({ studentId: 'student-1', targetClassId: 'class-en' }, auth('owner-a'), dependencies),
    'failed-precondition',
  );
  await expectCode(
    () => handleAssignStudentToClass({ studentId: 'missing', targetClassId: 'class-a2' }, auth('owner-a'), dependencies),
    'not-found',
  );
  await expectCode(
    () => handleAssignStudentToClass({ studentId: 'student-1', targetClassId: 'missing' }, auth('owner-a'), dependencies),
    'not-found',
  );
  await expectCode(
    () => handleAssignStudentToClass({ studentId: 'student-1', targetClassId: 'class-a2', schoolId: 'school-b' }, auth('owner-a'), dependencies),
    'invalid-argument',
  );

  const before = structuredClone(students.get('student-1'));
  const concurrent = await Promise.all([
    handleAssignStudentToClass({ studentId: 'student-1', targetClassId: 'class-a2' }, auth('owner-a'), dependencies),
    handleAssignStudentToClass({ studentId: 'student-1', targetClassId: 'class-a3' }, auth('director-a'), dependencies),
  ]);
  assert.equal(concurrent.every(result => result.success), true);
  assert.equal(students.get('student-1').classId, 'class-a3');
  assert.equal(students.get('student-1').name, before.name);
  assert.equal(students.get('student-1').phone, before.phone);
  assert.deepEqual(Object.keys(students.get('student-1')).sort(), [...Object.keys(before), 'updatedAt', 'updatedBy'].sort());

  const classAudits = [...audits.values()].filter(row => row.action === 'STUDENT_CLASS_CHANGED');
  assert.ok(classAudits.length >= 2);
  for (const row of classAudits) {
    assert.equal(row.canonicalBackendAudit, true);
    assert.equal(row.targetType, 'STUDENT');
    assert.equal(row.userEmail, '');
    assert.equal(JSON.stringify(row).includes('PII must not leak'), false);
    assert.equal(JSON.stringify(row).includes('600000000'), false);
    assert.deepEqual(Object.keys(row.details).sort(), ['newClassId', 'previousClassId', 'studentId']);
  }

  const auditCount = audits.size;
  const idempotent = await handleAssignStudentToClass(
    { studentId: 'student-1', targetClassId: 'class-a3' }, auth('secretary-a'), dependencies,
  );
  assert.equal(idempotent.changed, false);
  assert.equal(audits.size, auditCount);

  console.log('Student class assignment RBAC/tenant/validation/concurrency/audit tests: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
