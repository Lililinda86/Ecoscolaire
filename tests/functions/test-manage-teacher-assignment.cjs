const assert = require('node:assert/strict');
const Module = require('node:module');
const originalRequire = Module.prototype.require;

const documents = new Map();
let generated = 0;
let transactionTail = Promise.resolve();
const snapshot = (path) => ({
  id: path.split('/').at(-1),
  exists: documents.has(path),
  data: () => documents.get(path),
});
const reference = (path) => ({ path, id: path.split('/').at(-1), get: async () => snapshot(path) });
const query = (collection, filters = []) => ({
  collection, filters,
  where(field, operator, value) { return query(collection, [...filters, { field, operator, value }]); },
});
const read = async (target) => {
  if (target.path) return snapshot(target.path);
  const docs = [...documents.entries()].filter(([path, data]) => path.startsWith(`${target.collection}/`)
    && path.split('/').length === 2
    && target.filters.every(filter => filter.operator === '==' && data[filter.field] === filter.value))
    .map(([path, data]) => ({ id: path.split('/').at(-1), data: () => data }));
  return { docs, empty: docs.length === 0 };
};
const db = {
  collection(name) {
    return {
      doc(id) { return reference(`${name}/${id || `generated-${++generated}`}`); },
      where(field, operator, value) { return query(name, [{ field, operator, value }]); },
    };
  },
  runTransaction(handler) {
    const execute = () => handler({
      get: read,
      create(ref, data) { if (documents.has(ref.path)) throw new Error('ALREADY_EXISTS'); documents.set(ref.path, { ...data }); },
      set(ref, data, options) { documents.set(ref.path, options?.merge ? { ...documents.get(ref.path), ...data } : { ...data }); },
      update(ref, data) { if (!documents.has(ref.path)) throw new Error('NOT_FOUND'); documents.set(ref.path, { ...documents.get(ref.path), ...data }); },
    });
    const result = transactionTail.then(execute, execute);
    transactionTail = result.then(() => undefined, () => undefined);
    return result;
  },
};
class HttpsError extends Error { constructor(code, message, details) { super(message); this.code = code; this.details = details; } }
const functionsMock = { https: { onCall: handler => handler, HttpsError } };
const fieldValue = { serverTimestamp: () => 'SERVER_TIMESTAMP' };
Module.prototype.require = function patched(name) {
  if (name === 'firebase-admin') return { firestore: () => db };
  if (name === 'firebase-admin/firestore') return { FieldValue: fieldValue };
  if (name === 'firebase-functions') return functionsMock;
  return originalRequire.apply(this, arguments);
};
const { manageTeacherAssignment } = require('../../functions/lib/academic/manageTeacherAssignment.js');
Module.prototype.require = originalRequire;

const put = (collection, id, data) => documents.set(`${collection}/${id}`, data);
const actor = (uid, role = 'owner', schoolId = 'school-a') => put('users', uid, { role, schoolId, active: true });
const seedCore = ({ staffId = 'staff-a', subjectId = 'math', classId = 'class-a', schoolId = 'school-a' } = {}) => {
  put('academicYears', 'year-a', { schoolId, status: 'active' });
  put('classes', classId, { schoolId, active: true });
  put('subjects', subjectId, { schoolId, active: true });
  put('staff', staffId, { schoolId, staffType: 'teacher', active: true });
};
const linkTeacher = (staffId = 'staff-a', userId = 'teacher-a', schoolId = 'school-a') => {
  put('users', userId, { role: 'teacher', schoolId, active: true });
  put('staffUserLinkByStaff', `${schoolId}__${staffId}`, { schoolId, staffId, userId, linkId: `link-${staffId}`, isActive: true });
  put('staffUserLinkByUser', userId, { schoolId, staffId, userId, linkId: `link-${staffId}`, isActive: true });
  put('staffUserLinks', `link-${staffId}`, { schoolId, staffId, userId, isActive: true });
};
const publish = (subjectId = 'math') => {
  put('classPrograms', 'program-a', { schoolId: 'school-a', academicYearId: 'year-a', classId: 'class-a', status: 'published', publishedRevisionId: 'revision-a' });
  put('classSubjects', `revision-a__${subjectId}`, { schoolId: 'school-a', academicYearId: 'year-a', classId: 'class-a', programId: 'program-a', revisionId: 'revision-a', subjectId, isActive: true });
};
const call = (payload, uid = 'owner-a') => manageTeacherAssignment(payload, { auth: { uid } });
const expectBusiness = async (promise, code) => {
  await assert.rejects(promise, error => error.details?.businessCode === code);
};

(async () => {
  documents.clear(); actor('owner-a'); seedCore();
  const draft = await call({ action: 'CREATE_DRAFT', academicYearId: 'year-a', classId: 'class-a', subjectId: 'math', teacherStaffId: 'staff-a', note: 'préparation' });
  assert.equal(draft.assignment.status, 'draft');
  assert.equal([...documents.keys()].filter(key => key.startsWith('periods/')).length, 0);
  assert.equal([...documents.keys()].filter(key => key.startsWith('classPrograms/')).length, 0);
  await expectBusiness(call({ action: 'ACTIVATE', assignmentId: draft.assignment.id }), 'PROGRAM_NOT_PUBLISHED');

  actor('secretary-a', 'secretary');
  const edit = await call({ action: 'UPDATE_DRAFT', assignmentId: draft.assignment.id, note: 'corrigé' }, 'secretary-a');
  assert.equal(edit.assignment.note, 'corrigé');
  await expectBusiness(call({ action: 'ACTIVATE', assignmentId: draft.assignment.id }, 'secretary-a'), 'PERMISSION_DENIED');

  publish();
  await expectBusiness(call({ action: 'ACTIVATE', assignmentId: draft.assignment.id }), 'TEACHER_LINK_REQUIRED');
  linkTeacher();
  const active = await call({ action: 'ACTIVATE', assignmentId: draft.assignment.id });
  assert.equal(active.assignment.status, 'active');
  assert.equal(documents.get(`teacherAssignmentSlots/${draft.assignment.id}`).isActive, true);

  const duplicate = await Promise.all([
    call({ action: 'CREATE_DRAFT', academicYearId: 'year-a', classId: 'class-a', subjectId: 'math', teacherStaffId: 'staff-a' }),
    call({ action: 'CREATE_DRAFT', academicYearId: 'year-a', classId: 'class-a', subjectId: 'math', teacherStaffId: 'staff-a' }),
  ]);
  assert.equal(duplicate.filter(result => result.changed).length, 0);
  assert.equal([...documents.keys()].filter(key => key === `teacherAssignments/${draft.assignment.id}`).length, 1);

  seedCore({ staffId: 'staff-b' }); linkTeacher('staff-b', 'teacher-b');
  const coTeacher = await call({ action: 'CREATE_DRAFT', academicYearId: 'year-a', classId: 'class-a', subjectId: 'math', teacherStaffId: 'staff-b' });
  await call({ action: 'ACTIVATE', assignmentId: coTeacher.assignment.id });
  assert.notEqual(coTeacher.assignment.id, draft.assignment.id);
  assert.equal([...documents.entries()].filter(([key, row]) => key.startsWith('teacherAssignments/') && row.status === 'active' && row.classId === 'class-a' && row.subjectId === 'math').length, 2);

  const inactive = await call({ action: 'DEACTIVATE', assignmentId: draft.assignment.id, reason: 'fin' });
  assert.equal(inactive.assignment.status, 'inactive');
  assert.equal(documents.get(`teacherAssignmentSlots/${draft.assignment.id}`).isActive, false);
  assert.equal(documents.has(`teacherAssignments/${draft.assignment.id}`), true);

  put('staff', 'staff-b', { ...documents.get('staff/staff-b'), active: false });
  const revokedAfterStaffDisabled = await call({ action: 'DEACTIVATE', assignmentId: coTeacher.assignment.id, reason: 'compte désactivé' });
  assert.equal(revokedAfterStaffDisabled.assignment.status, 'inactive');

  put('subjects', 'foreign', { schoolId: 'school-b', active: true });
  await expectBusiness(call({ action: 'CREATE_DRAFT', academicYearId: 'year-a', classId: 'class-a', subjectId: 'foreign', teacherStaffId: 'staff-a' }), 'SCHOOL_MISMATCH');

  put('subjects', 'science', { schoolId: 'school-a', active: true });
  const outsideProgram = await call({ action: 'CREATE_DRAFT', academicYearId: 'year-a', classId: 'class-a', subjectId: 'science', teacherStaffId: 'staff-a' });
  await expectBusiness(call({ action: 'ACTIVATE', assignmentId: outsideProgram.assignment.id }), 'SUBJECT_NOT_IN_PUBLISHED_PROGRAM');

  put('classes', 'inactive-class', { schoolId: 'school-a', active: false, isActive: true, status: 'active' });
  await expectBusiness(call({ action: 'CREATE_DRAFT', academicYearId: 'year-a', classId: 'inactive-class', subjectId: 'math', teacherStaffId: 'staff-a' }), 'CLASS_INACTIVE');
  put('subjects', 'inactive-subject', { schoolId: 'school-a', active: false });
  await expectBusiness(call({ action: 'CREATE_DRAFT', academicYearId: 'year-a', classId: 'class-a', subjectId: 'inactive-subject', teacherStaffId: 'staff-a' }), 'SUBJECT_INACTIVE');
  put('staff', 'inactive-staff', { schoolId: 'school-a', staffType: 'teacher', active: false });
  await expectBusiness(call({ action: 'CREATE_DRAFT', academicYearId: 'year-a', classId: 'class-a', subjectId: 'math', teacherStaffId: 'inactive-staff' }), 'TEACHER_INACTIVE');
  await expectBusiness(call({ action: 'CREATE_DRAFT', academicYearId: 'missing-year', classId: 'class-a', subjectId: 'math', teacherStaffId: 'staff-a' }), 'ACADEMIC_YEAR_NOT_FOUND');
  put('academicYears', 'closed-year', { schoolId: 'school-a', status: 'closed' });
  await expectBusiness(call({ action: 'CREATE_DRAFT', academicYearId: 'closed-year', classId: 'class-a', subjectId: 'math', teacherStaffId: 'staff-a' }), 'ACADEMIC_YEAR_INACTIVE');
  put('academicYears', 'draft-year', { schoolId: 'school-a', status: 'draft' });
  const futureDraft = await call({ action: 'CREATE_DRAFT', academicYearId: 'draft-year', classId: 'class-a', subjectId: 'math', teacherStaffId: 'staff-a' });
  await expectBusiness(call({ action: 'ACTIVATE', assignmentId: futureDraft.assignment.id }), 'ACADEMIC_YEAR_INACTIVE');

  for (const [uid, role] of [['teacher-denied', 'teacher'], ['parent-denied', 'parent'], ['student-denied', 'student'], ['driver-denied', 'driver'], ['board-denied', 'boardViewer']]) {
    actor(uid, role);
    await expectBusiness(call({ action: 'CREATE_DRAFT', academicYearId: 'year-a', classId: 'class-a', subjectId: 'math', teacherStaffId: 'staff-a' }, uid), 'PERMISSION_DENIED');
  }

  seedCore({ staffId: 'staff-concurrent' }); linkTeacher('staff-concurrent', 'teacher-concurrent');
  const concurrentDraft = await call({ action: 'CREATE_DRAFT', academicYearId: 'year-a', classId: 'class-a', subjectId: 'math', teacherStaffId: 'staff-concurrent' });
  const activationResults = await Promise.all([
    call({ action: 'ACTIVATE', assignmentId: concurrentDraft.assignment.id }),
    call({ action: 'ACTIVATE', assignmentId: concurrentDraft.assignment.id }),
  ]);
  assert.equal(activationResults.filter(result => result.changed).length, 1);
  assert.equal([...documents.keys()].filter(key => key === `teacherAssignments/${concurrentDraft.assignment.id}`).length, 1);
  const auditActions = new Set([...documents.entries()].filter(([key]) => key.startsWith('audit_logs/')).map(([, row]) => row.action));
  for (const expected of ['TEACHER_ASSIGNMENT_CREATED', 'TEACHER_ASSIGNMENT_UPDATED', 'TEACHER_ASSIGNMENT_ACTIVATED', 'TEACHER_ASSIGNMENT_DEACTIVATED']) assert.equal(auditActions.has(expected), true);
  console.log('Teacher assignment lifecycle: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
