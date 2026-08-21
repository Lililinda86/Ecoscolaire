const assert = require('node:assert/strict');
const { attendanceDocumentId, handleRecordStudentAttendance, resolveAcademicYearId } = require('../../functions/lib/studentAttendance.js');

const users = new Map([
  ['super', { role: 'superAdmin', active: true }],
  ['owner-a', { role: 'owner', schoolId: 'school-a', active: true }],
  ['director-a', { role: 'director', schoolId: 'school-a', isActive: true }],
  ['secretary-a', { role: 'secretary', schoolId: 'school-a', status: 'active' }],
  ['teacher-a', { role: 'teacher', schoolId: 'school-a', active: true }],
  ['teacher-other', { role: 'teacher', schoolId: 'school-a', active: true }],
  ['owner-b', { role: 'owner', schoolId: 'school-b', active: true }],
  ['parent-a', { role: 'parent', schoolId: 'school-a', active: true }],
  ['student-a-user', { role: 'student', schoolId: 'school-a', active: true }],
  ['driver-a', { role: 'driver', schoolId: 'school-a', active: true }],
  ['board-a', { role: 'boardViewer', schoolId: 'school-a', active: true }],
]);
const students = new Map([
  ['student-a', { id: 'student-a', schoolId: 'school-a', classId: 'class-a', testFixture: true, testRunId: 'run-attendance', name: 'PII must not leak' }],
  ['student-inactive', { id: 'student-inactive', schoolId: 'school-a', classId: 'class-a', active: false }],
  ['student-cross', { id: 'student-cross', schoolId: 'school-b', classId: 'class-b', active: true }],
]);
const classes = new Map([
  ['class-a', { id: 'class-a', schoolId: 'school-a', active: true }],
  ['class-b', { id: 'class-b', schoolId: 'school-b', active: true }],
]);
const schools = new Map([
  ['school-a', { id: 'school-a', activeAcademicYearId: 'year-a' }],
  ['school-b', { id: 'school-b', activeAcademicYearId: 'year-b' }],
]);
const links = new Map([
  ['teacher-a', { schoolId: 'school-a', staffId: 'staff-a', isActive: true }],
  ['teacher-other', { schoolId: 'school-a', staffId: 'staff-other', isActive: true }],
]);
const slots = [
  { schoolId: 'school-a', academicYearId: 'year-a', classId: 'class-a', teacherStaffId: 'staff-a', isActive: true },
];
const attendance = new Map();
const audits = new Map();
const serverTimestamp = Object.freeze({ trustedServerTimestamp: true });
let auditSequence = 0;
let transactionTail = Promise.resolve();

const dependencies = {
  newAuditId: () => `audit-${++auditSequence}`,
  serverTimestamp: () => serverTimestamp,
  nowIso: () => `2026-08-21T12:00:${String(auditSequence).padStart(2, '0')}.000Z`,
  runTransaction: handler => {
    const operation = transactionTail.then(() => handler({
      getUser: async id => ({ exists: users.has(id), data: users.get(id) }),
      getStudent: async id => ({ exists: students.has(id), data: students.get(id) }),
      getClass: async id => ({ exists: classes.has(id), data: classes.get(id) }),
      getSchool: async id => ({ exists: schools.has(id), data: schools.get(id) }),
      getStaffLink: async id => ({ exists: links.has(id), data: links.get(id) }),
      getTeacherSlots: async staffId => slots.filter(slot => slot.teacherStaffId === staffId),
      getAttendance: async id => ({ exists: attendance.has(id), data: attendance.get(id) }),
      setAttendance: (id, record) => attendance.set(id, structuredClone(record)),
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
  assert.equal(resolveAcademicYearId({ activeAcademicYearId: 'year-id', academicYear: '2026-2027' }), 'year-id');
  assert.equal(resolveAcademicYearId({ academicYear: '2026-2027' }), '2026-2027');
  assert.equal(
    attendanceDocumentId('school-a', 'year-a', '2026-08-21', 'student-a'),
    attendanceDocumentId('school-a', 'year-a', '2026-08-21', 'student-a'),
  );
  assert.notEqual(
    attendanceDocumentId('school-a', 'year-a', '2026-08-21', 'student-a'),
    attendanceDocumentId('school-a', 'year-a', '2026-08-22', 'student-a'),
  );
  assert.notEqual(
    attendanceDocumentId('school-a', 'year-a', '2026-08-21', 'student-a'),
    attendanceDocumentId('school-a', 'year-b', '2026-08-21', 'student-a'),
  );

  for (const uid of ['owner-a', 'director-a', 'secretary-a', 'super', 'teacher-a']) {
    const result = await handleRecordStudentAttendance(
      { studentId: 'student-a', date: '2026-08-21', status: 'present' }, auth(uid), dependencies,
    );
    assert.equal(result.success, true);
  }

  for (const uid of ['teacher-other', 'owner-b', 'parent-a', 'student-a-user', 'driver-a', 'board-a']) {
    await expectCode(
      () => handleRecordStudentAttendance({ studentId: 'student-a', date: '2026-08-21', status: 'present' }, auth(uid), dependencies),
      'permission-denied',
    );
  }

  await expectCode(() => handleRecordStudentAttendance({ studentId: 'student-a', date: '2026-02-30', status: 'present' }, auth('owner-a'), dependencies), 'invalid-argument');
  await expectCode(() => handleRecordStudentAttendance({ studentId: 'student-a', date: '21/08/2026', status: 'present' }, auth('owner-a'), dependencies), 'invalid-argument');
  await expectCode(() => handleRecordStudentAttendance({ studentId: 'student-a', date: '2026-08-21', status: 'excused' }, auth('owner-a'), dependencies), 'invalid-argument');
  await expectCode(() => handleRecordStudentAttendance({ studentId: 'student-inactive', date: '2026-08-21', status: 'absent' }, auth('owner-a'), dependencies), 'failed-precondition');
  await expectCode(() => handleRecordStudentAttendance({ studentId: 'student-cross', date: '2026-08-21', status: 'absent' }, auth('teacher-a'), dependencies), 'permission-denied');
  await expectCode(() => handleRecordStudentAttendance({ studentId: 'missing', date: '2026-08-21', status: 'absent' }, auth('owner-a'), dependencies), 'not-found');
  await expectCode(() => handleRecordStudentAttendance({ studentId: 'student-a', date: '2026-08-21', status: 'present', schoolId: 'school-b' }, auth('owner-a'), dependencies), 'invalid-argument');

  await Promise.all([
    handleRecordStudentAttendance({ studentId: 'student-a', date: '2026-08-22', status: 'present' }, auth('owner-a'), dependencies),
    handleRecordStudentAttendance({ studentId: 'student-a', date: '2026-08-22', status: 'absent', note: 'Correction' }, auth('director-a'), dependencies),
    handleRecordStudentAttendance({ studentId: 'student-a', date: '2026-08-22', status: 'left_early', note: 'Autorisation' }, auth('secretary-a'), dependencies),
  ]);
  const id = attendanceDocumentId('school-a', 'year-a', '2026-08-22', 'student-a');
  assert.equal(attendance.size, 2);
  assert.equal(attendance.get(id).status, 'left_early');
  assert.equal(attendance.get(id).version, 3);
  assert.equal(attendance.get(id).testRunId, 'run-attendance');

  const canonicalAudits = [...audits.values()].filter(row => row.attendanceId === id);
  assert.deepEqual(canonicalAudits.map(row => row.action), ['ATTENDANCE_RECORDED', 'ATTENDANCE_CORRECTED', 'ATTENDANCE_CORRECTED']);
  canonicalAudits.forEach(row => {
    assert.equal(row.canonicalBackendAudit, true);
    assert.equal(row.userEmail, '');
    assert.equal(JSON.stringify(row).includes('PII must not leak'), false);
  });

  const auditCount = audits.size;
  const unchanged = await handleRecordStudentAttendance(
    { studentId: 'student-a', date: '2026-08-22', status: 'left_early', note: 'Autorisation' }, auth('owner-a'), dependencies,
  );
  assert.equal(unchanged.changed, false);
  assert.equal(audits.size, auditCount);
  assert.equal(attendance.size, 2);

  console.log('Student attendance RBAC/tenant/validation/concurrency/correction/audit tests: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
