const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;

// Mock database structures
const docs = {};
const dbMock = {
  runTransaction: async (cb) => {
    return await cb({
      get: async (refOrQuery) => {
        if (typeof refOrQuery.mockGet === 'function') {
          return await refOrQuery.mockGet();
        }
        return await refOrQuery.mockGet();
      },
      create: (ref, data) => ref.mockCreate(data),
      update: (ref, data) => ref.mockUpdate(data),
      set: (ref, data) => ref.mockSet(data),
      delete: (ref) => ref.mockDelete()
    });
  },
  collection: (path) => ({
    doc: (id) => {
      const finalId = id || `mock_id_${Math.random().toString(36).substr(2, 9)}`;
      const key = `${path}/${finalId}`;
      if (!docs[key]) {
        docs[key] = {
          id: finalId,
          path: key,
          exists: false,
          _data: null,
          mockGet: function() {
            return {
              id: this.id,
              exists: this.exists,
              data: () => this._data
            };
          },
          get: async function() {
            return this.mockGet();
          },
          mockCreate: function(data) {
            this.exists = true;
            this._data = { ...data };
            this.creates.push(data);
          },
          mockUpdate: function(data) {
            this._data = { ...this._data, ...data };
            this.updates.push(data);
          },
          mockSet: function(data) {
            this.exists = true;
            this._data = { ...data };
            this.sets.push(data);
          },
          mockDelete: function() {
            this.exists = false;
            this._data = null;
            this.deletes.push(true);
          },
          setState: function(exists, data) {
            this.exists = exists;
            this._data = data;
            this.updates = [];
            this.creates = [];
            this.sets = [];
            this.deletes = [];
          },
          updates: [],
          creates: [],
          sets: [],
          deletes: []
        };
      }
      return docs[key];
    },
    where: function(field, op, val) {
      const filters = [{ field, op, val }];
      const queryObj = {
        where: function(f, o, v) {
          filters.push({ field: f, op: o, val: v });
          return this;
        },
        get: async function() {
          return this.mockGet();
        },
        mockGet: async () => {
          const matches = [];
          for (const key in docs) {
            if (key.startsWith(path + '/')) {
              const doc = docs[key];
              if (doc.exists && doc._data) {
                let match = true;
                for (const filter of filters) {
                  const dataValue = doc._data[filter.field];
                  const filterValue = filter.val;
                  if (filter.op === '==') {
                    if (dataValue !== filterValue) match = false;
                  } else if (filter.op === 'in') {
                    if (!Array.isArray(filterValue) || !filterValue.includes(dataValue)) match = false;
                  }
                }
                if (match) {
                  matches.push({
                    id: doc.id,
                    data: () => doc._data
                  });
                }
              }
            }
          }
          return {
            empty: matches.length === 0,
            docs: matches,
            forEach: function(cb) {
              matches.forEach(cb);
            }
          };
        }
      };
      return queryObj;
    }
  })
};

const adminMock = {
  initializeApp: () => {},
  firestore: () => dbMock
};

const functionsMock = {
  https: {
    onCall: (handler) => handler,
    HttpsError: class HttpsError extends Error {
      constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
      }
    }
  }
};

Module.prototype.require = function() {
  const name = arguments[0];
  if (name === 'firebase-admin') {
    return adminMock;
  }
  if (name === 'firebase-functions') {
    return functionsMock;
  }
  return originalRequire.apply(this, arguments);
};

// Import compiled functions
const { setPrimaryTeacherAssignment } = require('../../functions/lib/academic/setPrimaryTeacherAssignment.js');
const { deactivateTeacherAssignment } = require('../../functions/lib/academic/deactivateTeacherAssignment.js');
const { getTeacherAssignmentCandidates } = require('../../functions/lib/academic/getTeacherAssignmentCandidates.js');

function resetDb() {
  for (const key in docs) {
    delete docs[key];
  }
}

function setDocState(collection, id, exists, data) {
  dbMock.collection(collection).doc(id).setState(exists, data);
}

// Test runner variables
let testsRun = 0;
let testsPassed = 0;

async function runTest(name, fn) {
  testsRun++;
  try {
    resetDb();
    await fn();
    testsPassed++;
    console.log(`✅ test("${name}") -> PASSED`);
  } catch (err) {
    console.error(`❌ test("${name}") -> FAILED`);
    console.error(err);
    process.exit(1);
  }
}

const assertThrowsBusinessError = async (fn, expectedCode, expectedBusinessCode) => {
  try {
    await fn();
    assert.fail(`Expected function to throw HttpsError with ${expectedBusinessCode}`);
  } catch (err) {
    if (err.name === 'AssertionError') throw err;
    assert.strictEqual(err.code, expectedCode, `Expected code ${expectedCode}, got ${err.code}`);
    assert.ok(err.details, 'Expected error details to exist');
    assert.strictEqual(err.details.businessCode, expectedBusinessCode, `Expected businessCode ${expectedBusinessCode}, got ${err.details.businessCode}`);
  }
};

async function runAllTests() {
  console.log('🧪 Starting Teacher Assignments Cloud Functions Tests...');

  // -------------------------------------------------------------
  // AUTHENTIFICATION & ROLES
  // -------------------------------------------------------------

  await runTest('non authentifié', async () => {
    await assertThrowsBusinessError(
      () => setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, {}),
      'unauthenticated',
      'UNAUTHENTICATED'
    );
  });

  await runTest('rôle non autorisé (teacher)', async () => {
    setDocState('users', 'op_teacher', true, { role: 'teacher', isActive: true, schoolId: 'S1' });
    await assertThrowsBusinessError(
      () => setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_teacher' } }),
      'permission-denied',
      'PERMISSION_DENIED'
    );
  });

  await runTest('secretary même école autorisée', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('staff', 'ST1', true, { schoolId: 'S1', role: 'teacher', isActive: true });
    setDocState('classPrograms', 'S1__2026-2027__C1', true, { schoolId: 'S1', publishedRevisionId: 'REV1' });
    setDocState('classSubjects', 'REV1__SUB1', true, { schoolId: 'S1', programId: 'S1__2026-2027__C1', isActive: true });

    const res = await setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } });
    assert.strictEqual(res.assigned, true);
  });

  await runTest('autre école refusée', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S2' });
    await assertThrowsBusinessError(
      () => setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } }),
      'permission-denied',
      'SCHOOL_MISMATCH'
    );
  });

  await runTest('gestionnaire inactif', async () => {
    setDocState('users', 'op_inactive', true, { role: 'secretary', isActive: false, schoolId: 'S1' });
    await assertThrowsBusinessError(
      () => setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_inactive' } }),
      'permission-denied',
      'PERMISSION_DENIED'
    );
  });

  // -------------------------------------------------------------
  // CLASSE
  // -------------------------------------------------------------

  await runTest('classe absente', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    await assertThrowsBusinessError(
      () => setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C_ABSENT', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } }),
      'not-found',
      'CLASS_NOT_FOUND'
    );
  });

  await runTest('classe autre école', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S2', isActive: true });
    await assertThrowsBusinessError(
      () => setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } }),
      'permission-denied',
      'SCHOOL_MISMATCH'
    );
  });

  await runTest('classe inactive', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: false });
    await assertThrowsBusinessError(
      () => setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } }),
      'failed-precondition',
      'CLASS_INACTIVE'
    );
  });

  // -------------------------------------------------------------
  // ENSEIGNANT & LIAISON
  // -------------------------------------------------------------

  await runTest('staff absent', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    await assertThrowsBusinessError(
      () => setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST_ABSENT' }, { auth: { uid: 'op_sec' } }),
      'not-found',
      'TEACHER_NOT_FOUND'
    );
  });

  await runTest('staff non teacher', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('staff', 'ST1', true, { schoolId: 'S1', role: 'accountant', isActive: true });
    await assertThrowsBusinessError(
      () => setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } }),
      'failed-precondition',
      'TEACHER_NOT_ELIGIBLE'
    );
  });

  await runTest('staff inactive', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('staff', 'ST1', true, { schoolId: 'S1', role: 'teacher', isActive: false });
    await assertThrowsBusinessError(
      () => setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } }),
      'failed-precondition',
      'TEACHER_INACTIVE'
    );
  });

  await runTest('staff sans compte lié autorisé', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('staff', 'ST1', true, { schoolId: 'S1', role: 'teacher', isActive: true });
    setDocState('classPrograms', 'S1__2026-2027__C1', true, { schoolId: 'S1', publishedRevisionId: 'REV1' });
    setDocState('classSubjects', 'REV1__SUB1', true, { schoolId: 'S1', programId: 'S1__2026-2027__C1', isActive: true });

    const res = await setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } });
    assert.strictEqual(res.assigned, true);

    const hist = docs[`teacherAssignments/${res.assignmentId}`]._data;
    assert.strictEqual(hist.teacherUserId, undefined);
  });

  await runTest('staff avec lien actif intègre', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('staff', 'ST1', true, { schoolId: 'S1', role: 'teacher', isActive: true });
    setDocState('classPrograms', 'S1__2026-2027__C1', true, { schoolId: 'S1', publishedRevisionId: 'REV1' });
    setDocState('classSubjects', 'REV1__SUB1', true, { schoolId: 'S1', programId: 'S1__2026-2027__C1', isActive: true });

    // Link setup
    setDocState('staffUserLinkByStaff', 'S1__ST1', true, { userId: 'U1', staffId: 'ST1', schoolId: 'S1', linkId: 'L1', isActive: true });
    setDocState('staffUserLinkByUser', 'U1', true, { userId: 'U1', staffId: 'ST1', schoolId: 'S1', linkId: 'L1', isActive: true });
    setDocState('staffUserLinks', 'L1', true, { userId: 'U1', staffId: 'ST1', schoolId: 'S1', isActive: true });

    const res = await setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } });
    assert.strictEqual(res.assigned, true);

    const hist = docs[`teacherAssignments/${res.assignmentId}`]._data;
    assert.strictEqual(hist.teacherUserId, 'U1');
  });

  // -------------------------------------------------------------
  // PROGRAMME & MATIÈRE
  // -------------------------------------------------------------

  await runTest('programme absent', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('staff', 'ST1', true, { schoolId: 'S1', role: 'teacher', isActive: true });
    await assertThrowsBusinessError(
      () => setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } }),
      'not-found',
      'PROGRAM_NOT_FOUND'
    );
  });

  await runTest('programme non publié', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('staff', 'ST1', true, { schoolId: 'S1', role: 'teacher', isActive: true });
    setDocState('classPrograms', 'S1__2026-2027__C1', true, { schoolId: 'S1' }); // no publishedRevisionId

    await assertThrowsBusinessError(
      () => setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } }),
      'failed-precondition',
      'PROGRAM_NOT_PUBLISHED'
    );
  });

  await runTest('matière absente du programme publié', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('staff', 'ST1', true, { schoolId: 'S1', role: 'teacher', isActive: true });
    setDocState('classPrograms', 'S1__2026-2027__C1', true, { schoolId: 'S1', publishedRevisionId: 'REV1' });

    await assertThrowsBusinessError(
      () => setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB_ABSENT', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } }),
      'not-found',
      'SUBJECT_NOT_IN_PUBLISHED_PROGRAM'
    );
  });

  // -------------------------------------------------------------
  // ÉTATS DE SLOT ET MUTATIONS (AFFECTATION & DÉSAFFECTATION)
  // -------------------------------------------------------------

  await runTest('première affectation: création historique et slot', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('staff', 'ST1', true, { schoolId: 'S1', role: 'teacher', isActive: true });
    setDocState('classPrograms', 'S1__2026-2027__C1', true, { schoolId: 'S1', publishedRevisionId: 'REV1' });
    setDocState('classSubjects', 'REV1__SUB1', true, { schoolId: 'S1', programId: 'S1__2026-2027__C1', isActive: true });

    const res = await setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } });
    assert.strictEqual(res.assigned, true);

    // Validate slot document
    const slotDoc = docs[`teacherAssignmentSlots/${res.slotId}`];
    assert.ok(slotDoc && slotDoc.exists);
    assert.strictEqual(slotDoc._data.assignmentId, res.assignmentId);
    assert.strictEqual(slotDoc._data.isActive, true);
    assert.strictEqual(slotDoc._data.teacherStaffId, 'ST1');
  });

  await runTest('affectation idempotente', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('staff', 'ST1', true, { schoolId: 'S1', role: 'teacher', isActive: true });
    setDocState('classPrograms', 'S1__2026-2027__C1', true, { schoolId: 'S1', publishedRevisionId: 'REV1' });
    setDocState('classSubjects', 'REV1__SUB1', true, { schoolId: 'S1', programId: 'S1__2026-2027__C1', isActive: true });

    // Initial assignment
    const res1 = await setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } });
    assert.strictEqual(res1.assigned, true);

    // Call again with same inputs
    const res2 = await setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } });
    assert.strictEqual(res2.assigned, false);
    assert.strictEqual(res2.alreadyAssigned, true);
    assert.strictEqual(res2.assignmentId, res1.assignmentId);
  });

  await runTest('remplacement d’enseignant principal', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('staff', 'ST1', true, { schoolId: 'S1', role: 'teacher', isActive: true });
    setDocState('staff', 'ST2', true, { schoolId: 'S1', role: 'teacher', isActive: true });
    setDocState('classPrograms', 'S1__2026-2027__C1', true, { schoolId: 'S1', publishedRevisionId: 'REV1' });
    setDocState('classSubjects', 'REV1__SUB1', true, { schoolId: 'S1', programId: 'S1__2026-2027__C1', isActive: true });

    // Assign ST1
    const res1 = await setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } });

    // Replace with ST2
    const res2 = await setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST2' }, { auth: { uid: 'op_sec' } });
    assert.strictEqual(res2.assigned, true);

    // Check old assignment is deactivated
    const oldHist = docs[`teacherAssignments/${res1.assignmentId}`]._data;
    assert.strictEqual(oldHist.isActive, false);
    assert.ok(oldHist.endedAt);
    assert.ok(oldHist.deactivatedAt);
    assert.strictEqual(oldHist.deactivatedBy, 'op_sec');

    // Check slot is updated
    const slotDoc = docs[`teacherAssignmentSlots/${res2.slotId}`]._data;
    assert.strictEqual(slotDoc.assignmentId, res2.assignmentId);
    assert.strictEqual(slotDoc.teacherStaffId, 'ST2');
    assert.strictEqual(slotDoc.isActive, true);
  });

  await runTest('désaffectation avec motif facultatif', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('staff', 'ST1', true, { schoolId: 'S1', role: 'teacher', isActive: true });
    setDocState('classPrograms', 'S1__2026-2027__C1', true, { schoolId: 'S1', publishedRevisionId: 'REV1' });
    setDocState('classSubjects', 'REV1__SUB1', true, { schoolId: 'S1', programId: 'S1__2026-2027__C1', isActive: true });

    // Assign ST1
    const res1 = await setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } });

    // Deactivate assignment
    const res2 = await deactivateTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', reason: 'Congé maladie' }, { auth: { uid: 'op_sec' } });
    assert.strictEqual(res2.deactivated, true);

    // Check slot is marked inactive
    const slotDoc = docs[`teacherAssignmentSlots/${res2.slotId}`]._data;
    assert.strictEqual(slotDoc.isActive, false);

    // Check history is marked inactive with reason
    const histDoc = docs[`teacherAssignments/${res2.assignmentId}`]._data;
    assert.strictEqual(histDoc.isActive, false);
    assert.strictEqual(histDoc.deactivationReason, 'Congé maladie');
  });

  await runTest('désaffectation idempotente', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('staff', 'ST1', true, { schoolId: 'S1', role: 'teacher', isActive: true });
    setDocState('classPrograms', 'S1__2026-2027__C1', true, { schoolId: 'S1', publishedRevisionId: 'REV1' });
    setDocState('classSubjects', 'REV1__SUB1', true, { schoolId: 'S1', programId: 'S1__2026-2027__C1', isActive: true });

    const res1 = await setPrimaryTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1', teacherStaffId: 'ST1' }, { auth: { uid: 'op_sec' } });

    const res2 = await deactivateTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1' }, { auth: { uid: 'op_sec' } });
    assert.strictEqual(res2.deactivated, true);

    const res3 = await deactivateTeacherAssignment({ schoolId: 'S1', academicYearId: '2026-2027', classId: 'C1', subjectId: 'SUB1' }, { auth: { uid: 'op_sec' } });
    assert.strictEqual(res3.deactivated, false);
    assert.strictEqual(res3.alreadyDeactivated, true);
  });

  // -------------------------------------------------------------
  // GET TEACHER ASSIGNMENT CANDIDATES
  // -------------------------------------------------------------

  await runTest('candidates - non authentifié', async () => {
    await assertThrowsBusinessError(
      () => getTeacherAssignmentCandidates({ schoolId: 'S1' }, {}),
      'unauthenticated',
      'UNAUTHENTICATED'
    );
  });

  await runTest('candidates - rôle non autorisé (teacher)', async () => {
    setDocState('users', 'op_teacher', true, { role: 'teacher', isActive: true, schoolId: 'S1' });
    await assertThrowsBusinessError(
      () => getTeacherAssignmentCandidates({ schoolId: 'S1' }, { auth: { uid: 'op_teacher' } }),
      'permission-denied',
      'PERMISSION_DENIED'
    );
  });

  await runTest('candidates - secretary même école autorisée', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    const res = await getTeacherAssignmentCandidates({ schoolId: 'S1' }, { auth: { uid: 'op_sec' } });
    assert.ok(Array.isArray(res.candidates));
  });

  await runTest('candidates - autre école refusée', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S2' });
    await assertThrowsBusinessError(
      () => getTeacherAssignmentCandidates({ schoolId: 'S1' }, { auth: { uid: 'op_sec' } }),
      'permission-denied',
      'SCHOOL_MISMATCH'
    );
  });

  await runTest('candidates - status checking values', async () => {
    setDocState('users', 'op_sec', true, { role: 'secretary', isActive: true, schoolId: 'S1' });

    // 1. Unlinked teacher
    setDocState('staff', 'ST1', true, { name: 'Teacher One', schoolId: 'S1', role: 'teacher', isActive: true });

    // 2. Linked teacher
    setDocState('staff', 'ST2', true, { name: 'Teacher Two', schoolId: 'S1', role: 'teacher', isActive: true });
    setDocState('staffUserLinkByStaff', 'S1__ST2', true, { userId: 'U2', staffId: 'ST2', schoolId: 'S1', linkId: 'L2', isActive: true });
    setDocState('staffUserLinkByUser', 'U2', true, { userId: 'U2', staffId: 'ST2', schoolId: 'S1', linkId: 'L2', isActive: true });
    setDocState('staffUserLinks', 'L2', true, { userId: 'U2', staffId: 'ST2', schoolId: 'S1', isActive: true });

    // 3. Inactive linked teacher
    setDocState('staff', 'ST3', true, { name: 'Teacher Three', schoolId: 'S1', role: 'teacher', isActive: true });
    setDocState('staffUserLinkByStaff', 'S1__ST3', true, { userId: 'U3', staffId: 'ST3', schoolId: 'S1', linkId: 'L3', isActive: false });

    // 4. Inconsistent teacher
    setDocState('staff', 'ST4', true, { name: 'Teacher Four', schoolId: 'S1', role: 'teacher', isActive: true });
    setDocState('staffUserLinkByStaff', 'S1__ST4', true, { userId: 'U4', staffId: 'ST4', schoolId: 'S1', linkId: 'L4', isActive: true });
    // staffUserLinkByUser is missing

    const res = await getTeacherAssignmentCandidates({ schoolId: 'S1' }, { auth: { uid: 'op_sec' } });
    const list = res.candidates;

    const c1 = list.find(c => c.teacherStaffId === 'ST1');
    assert.strictEqual(c1.accountStatus, 'unlinked');
    assert.strictEqual(c1.isEligible, true);

    const c2 = list.find(c => c.teacherStaffId === 'ST2');
    assert.strictEqual(c2.accountStatus, 'linked');
    assert.strictEqual(c2.isEligible, true);

    const c3 = list.find(c => c.teacherStaffId === 'ST3');
    assert.strictEqual(c3.accountStatus, 'inactive');
    assert.strictEqual(c3.isEligible, true);

    const c4 = list.find(c => c.teacherStaffId === 'ST4');
    assert.strictEqual(c4.accountStatus, 'inconsistent');
    assert.strictEqual(c4.isEligible, false);
  });

  console.log('\n================================================================');
  console.log(`TESTS SUMMARY: ${testsPassed} / ${testsRun} tests passed successfully.`);
  console.log('================================================================\n');

  if (testsPassed !== testsRun) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('❌ Test runner failed with error:', err);
  process.exit(1);
});
