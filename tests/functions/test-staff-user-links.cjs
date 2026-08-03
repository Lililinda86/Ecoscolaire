const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;

// Mock structures
const docs = {};
const dbMock = {
  runTransaction: async (cb) => {
    return await cb({
      get: async (ref) => {
        if (typeof ref.mockGet === 'function') {
          return await ref.mockGet();
        }
        return await ref.mockGet();
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
              exists: this.exists,
              data: () => this._data
            };
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
        mockGet: async () => {
          const matches = [];
          for (const key in docs) {
            if (key.startsWith(path + '/')) {
              const doc = docs[key];
              if (doc.exists && doc._data) {
                let match = true;
                for (const filter of filters) {
                  if (doc._data[filter.field] !== filter.val) {
                    match = false;
                    break;
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
            docs: matches
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

// Import compiled Functions from lib
const { linkStaffToUser } = require('../../functions/lib/staff/linkStaffToUser.js');
const { unlinkStaffFromUser } = require('../../functions/lib/staff/unlinkStaffFromUser.js');

function resetDb() {
  for (const key in docs) {
    delete docs[key];
  }
}

// Helpers to setup Firestore state
function setDocState(collection, id, exists, data) {
  dbMock.collection(collection).doc(id).setState(exists, data);
}

async function runTests() {
  console.log('🧪 Starting Staff-User Links Cloud Functions Tests...');

  // Helper assertions for HttpsError
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

  // -------------------------------------------------------------
  // Test linkStaffToUser - Authorizations & Identity Rules
  // -------------------------------------------------------------
  
  // 1. non authentifié refusé
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'ST1', userId: 'U1' }, {}),
    'unauthenticated',
    'UNAUTHENTICATED'
  );

  // Set up common entities
  setDocState('users', 'operator_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
  setDocState('users', 'operator_secretary', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
  setDocState('users', 'target_teacher', true, { role: 'teacher', isActive: true, schoolId: 'S1' });
  setDocState('users', 'target_teacher_inactive', true, { role: 'teacher', isActive: false, schoolId: 'S1' });
  setDocState('users', 'target_non_teacher', true, { role: 'accountant', isActive: true, schoolId: 'S1' });
  setDocState('users', 'target_teacher_other_school', true, { role: 'teacher', isActive: true, schoolId: 'S2' });

  setDocState('staff', 'staff_teacher', true, { role: 'teacher', schoolId: 'S1' }); // no isActive field = active (legacy compatibility)
  setDocState('staff', 'staff_teacher_inactive', true, { role: 'teacher', isActive: false, schoolId: 'S1' });
  setDocState('staff', 'staff_non_teacher', true, { role: 'driver', schoolId: 'S1' });
  setDocState('staff', 'staff_teacher_other_school', true, { role: 'teacher', schoolId: 'S2' });

  // 2. teacher refusé
  setDocState('users', 'operator_teacher', true, { role: 'teacher', isActive: true, schoolId: 'S1' });
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher' }, { auth: { uid: 'operator_teacher' } }),
    'permission-denied',
    'PERMISSION_DENIED'
  );

  // 3. secretary refusée
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher' }, { auth: { uid: 'operator_secretary' } }),
    'permission-denied',
    'PERMISSION_DENIED'
  );

  // 8. gestionnaire inactif refusé
  setDocState('users', 'operator_inactive', true, { role: 'director', isActive: false, schoolId: 'S1' });
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher' }, { auth: { uid: 'operator_inactive' } }),
    'permission-denied',
    'PERMISSION_DENIED'
  );

  // 9. gestionnaire autre école refusé
  setDocState('users', 'operator_other_school', true, { role: 'director', isActive: true, schoolId: 'S2' });
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher' }, { auth: { uid: 'operator_other_school' } }),
    'permission-denied',
    'PERMISSION_DENIED'
  );

  // superAdmin de l'école est autorisé
  setDocState('users', 'operator_superadmin', true, { role: 'superAdmin', isActive: true });
  
  // 10. utilisateur absent
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'staff_teacher', userId: 'non_existent_user' }, { auth: { uid: 'operator_director' } }),
    'not-found',
    'USER_NOT_FOUND'
  );

  // 11. utilisateur inactif
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher_inactive' }, { auth: { uid: 'operator_director' } }),
    'failed-precondition',
    'USER_INACTIVE'
  );

  // 12. utilisateur non teacher
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_non_teacher' }, { auth: { uid: 'operator_director' } }),
    'failed-precondition',
    'USER_NOT_TEACHER'
  );

  // 13. utilisateur autre école
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher_other_school' }, { auth: { uid: 'operator_director' } }),
    'permission-denied',
    'SCHOOL_MISMATCH'
  );

  // 14. staff absent
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'non_existent_staff', userId: 'target_teacher' }, { auth: { uid: 'operator_director' } }),
    'not-found',
    'STAFF_NOT_FOUND'
  );

  // 15. staff non teacher
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'staff_non_teacher', userId: 'target_teacher' }, { auth: { uid: 'operator_director' } }),
    'failed-precondition',
    'STAFF_NOT_TEACHER'
  );

  // 16. staff autre école
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'staff_teacher_other_school', userId: 'target_teacher' }, { auth: { uid: 'operator_director' } }),
    'permission-denied',
    'SCHOOL_MISMATCH'
  );

  // 17. staff isActive false refusé
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'staff_teacher_inactive', userId: 'target_teacher' }, { auth: { uid: 'operator_director' } }),
    'failed-precondition',
    'STAFF_INACTIVE'
  );

  // 18. staff sans isActive (legacy) accepté, et 20. status remplacé ou absent accepté
  setDocState('staff', 'staff_legacy_ok', true, { role: 'teacher', schoolId: 'S1', status: 'remplacé' });
  const legacyLinkResult = await linkStaffToUser(
    { schoolId: 'S1', staffId: 'staff_legacy_ok', userId: 'target_teacher' },
    { auth: { uid: 'operator_director' } }
  );
  assert.ok(legacyLinkResult.linked);
  assert.strictEqual(legacyLinkResult.alreadyLinked, false);

  // Clean up
  resetDb();
  setDocState('users', 'operator_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
  setDocState('users', 'target_teacher', true, { role: 'teacher', isActive: true, schoolId: 'S1' });
  setDocState('staff', 'staff_teacher', true, { role: 'teacher', schoolId: 'S1' });

  // 21. Première liaison réussie (création)
  const result = await linkStaffToUser(
    { schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher' },
    { auth: { uid: 'operator_director' } }
  );
  assert.ok(result.linked);
  assert.strictEqual(result.alreadyLinked, false);
  const linkId = result.linkId;

  // 22. Trois documents créés et cohérents
  const linkDoc = docs[`staffUserLinks/${linkId}`];
  const userPointerDoc = docs[`staffUserLinkByUser/target_teacher`];
  const staffPointerDoc = docs[`staffUserLinkByStaff/S1__staff_teacher`];

  assert.ok(linkDoc && linkDoc.exists);
  assert.ok(userPointerDoc && userPointerDoc.exists);
  assert.ok(staffPointerDoc && staffPointerDoc.exists);

  assert.strictEqual(linkDoc._data.isActive, true);
  assert.strictEqual(userPointerDoc._data.isActive, true);
  assert.strictEqual(staffPointerDoc._data.isActive, true);
  assert.strictEqual(userPointerDoc._data.linkId, linkId);
  assert.strictEqual(staffPointerDoc._data.linkId, linkId);

  // 26. Retry actif idempotent
  const retryResult = await linkStaffToUser(
    { schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher' },
    { auth: { uid: 'operator_director' } }
  );
  assert.strictEqual(retryResult.linked, false);
  assert.strictEqual(retryResult.alreadyLinked, true);
  assert.strictEqual(retryResult.linkId, linkId);

  // Conflict cases:
  // USER_ALREADY_LINKED
  setDocState('users', 'target_teacher_2', true, { role: 'teacher', isActive: true, schoolId: 'S1' });
  setDocState('staff', 'staff_teacher_2', true, { role: 'teacher', schoolId: 'S1' });
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'staff_teacher_2', userId: 'target_teacher' }, { auth: { uid: 'operator_director' } }),
    'already-exists',
    'USER_ALREADY_LINKED'
  );

  // STAFF_ALREADY_LINKED
  await assertThrowsBusinessError(
    () => linkStaffToUser({ schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher_2' }, { auth: { uid: 'operator_director' } }),
    'already-exists',
    'STAFF_ALREADY_LINKED'
  );

  // -------------------------------------------------------------
  // Test unlinkStaffFromUser - Logical Dissociation
  // -------------------------------------------------------------
  
  // Unlink reason validation
  const tooLongReason = 'a'.repeat(501);
  await assertThrowsBusinessError(
    () => unlinkStaffFromUser({ schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher', reason: tooLongReason }, { auth: { uid: 'operator_director' } }),
    'invalid-argument',
    'INVALID_ARGUMENT'
  );

  // Dissociation réussie
  const unlinkRes = await unlinkStaffFromUser(
    { schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher', reason: 'Dissociation test' },
    { auth: { uid: 'operator_director' } }
  );
  assert.ok(unlinkRes.unlinked);
  assert.strictEqual(unlinkRes.alreadyUnlinked, false);
  assert.strictEqual(unlinkRes.linkId, linkId);

  // Pointers & history remain present but are logically deactivated (isActive = false)
  assert.ok(linkDoc.exists);
  assert.ok(userPointerDoc.exists);
  assert.ok(staffPointerDoc.exists);

  assert.strictEqual(linkDoc._data.isActive, false);
  assert.strictEqual(userPointerDoc._data.isActive, false);
  assert.strictEqual(staffPointerDoc._data.isActive, false);
  assert.strictEqual(linkDoc._data.deactivationReason, 'Dissociation test');
  assert.strictEqual(linkDoc._data.deactivatedBy, 'operator_director');

  // Retry unlink idempotent
  const unlinkRetry = await unlinkStaffFromUser(
    { schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher' },
    { auth: { uid: 'operator_director' } }
  );
  assert.strictEqual(unlinkRetry.unlinked, false);
  assert.strictEqual(unlinkRetry.alreadyUnlinked, true);
  assert.strictEqual(unlinkRetry.linkId, linkId);

  // -------------------------------------------------------------
  // Test linkStaffToUser - Re-linking after unlink
  // -------------------------------------------------------------
  
  const relinkResult = await linkStaffToUser(
    { schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher' },
    { auth: { uid: 'operator_director' } }
  );
  assert.ok(relinkResult.linked);
  assert.strictEqual(relinkResult.alreadyLinked, false);
  assert.notStrictEqual(relinkResult.linkId, linkId, 'New linkId must be generated');

  const newLinkId = relinkResult.linkId;
  const newLinkDoc = docs[`staffUserLinks/${newLinkId}`];

  // Old historic doc remains inactive
  assert.strictEqual(linkDoc._data.isActive, false);
  // New historic doc is active
  assert.strictEqual(newLinkDoc._data.isActive, true);
  // Pointers are updated and active with new linkId
  assert.strictEqual(userPointerDoc._data.isActive, true);
  assert.strictEqual(userPointerDoc._data.linkId, newLinkId);
  assert.strictEqual(staffPointerDoc._data.isActive, true);
  assert.strictEqual(staffPointerDoc._data.linkId, newLinkId);

  // -------------------------------------------------------------
  // Test linkStaffToUser - Cross Re-linking scenarios after unlink
  // -------------------------------------------------------------
  
  // First unlink the relinked pair again to make target_teacher and staff_teacher inactive
  await unlinkStaffFromUser(
    { schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher' },
    { auth: { uid: 'operator_director' } }
  );

  // Scenario 43: userA (target_teacher, inactive pointer exists) to staffB (staff_teacher_2, no pointer exists)
  const crossRelinkUserAToStaffB = await linkStaffToUser(
    { schoolId: 'S1', staffId: 'staff_teacher_2', userId: 'target_teacher' },
    { auth: { uid: 'operator_director' } }
  );
  assert.ok(crossRelinkUserAToStaffB.linked);
  assert.strictEqual(crossRelinkUserAToStaffB.alreadyLinked, false);

  const crossLinkDocUserA = docs[`staffUserLinks/${crossRelinkUserAToStaffB.linkId}`];
  const userAPointerDoc = docs[`staffUserLinkByUser/target_teacher`];
  const staffBPointerDoc = docs[`staffUserLinkByStaff/S1__staff_teacher_2`];

  assert.strictEqual(crossLinkDocUserA._data.isActive, true);
  assert.strictEqual(userAPointerDoc._data.isActive, true);
  assert.strictEqual(userAPointerDoc._data.linkId, crossRelinkUserAToStaffB.linkId);
  assert.strictEqual(userAPointerDoc._data.staffId, 'staff_teacher_2');
  assert.strictEqual(staffBPointerDoc._data.isActive, true);
  assert.strictEqual(staffBPointerDoc._data.linkId, crossRelinkUserAToStaffB.linkId);

  // Scenario 44: userB (target_teacher_2, no pointer exists) to staffA (staff_teacher, inactive pointer exists)
  const crossRelinkUserBToStaffA = await linkStaffToUser(
    { schoolId: 'S1', staffId: 'staff_teacher', userId: 'target_teacher_2' },
    { auth: { uid: 'operator_director' } }
  );
  assert.ok(crossRelinkUserBToStaffA.linked);
  assert.strictEqual(crossRelinkUserBToStaffA.alreadyLinked, false);

  const crossLinkDocStaffA = docs[`staffUserLinks/${crossRelinkUserBToStaffA.linkId}`];
  const userBPointerDoc = docs[`staffUserLinkByUser/target_teacher_2`];
  const staffAPointerDoc = docs[`staffUserLinkByStaff/S1__staff_teacher`];

  assert.strictEqual(crossLinkDocStaffA._data.isActive, true);
  assert.strictEqual(userBPointerDoc._data.isActive, true);
  assert.strictEqual(userBPointerDoc._data.linkId, crossRelinkUserBToStaffA.linkId);
  assert.strictEqual(staffAPointerDoc._data.isActive, true);
  assert.strictEqual(staffAPointerDoc._data.linkId, crossRelinkUserBToStaffA.linkId);
  assert.strictEqual(staffAPointerDoc._data.userId, 'target_teacher_2');

  console.log('✅ All Staff-User Links Cloud Functions Tests PASSED successfully!');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
