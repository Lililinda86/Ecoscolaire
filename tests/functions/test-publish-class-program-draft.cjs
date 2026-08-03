const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;

// Mock structures
const docs = {};
const dbMock = {
  runTransaction: async (cb) => {
    return await cb({
      get: async (ref) => ref.mockGet(),
      create: (ref, data) => ref.mockCreate(data),
      update: (ref, data) => ref.mockUpdate(data)
    });
  },
  collection: (path) => ({
    doc: (id) => {
      const key = `${path}/${id}`;
      if (!docs[key]) {
        docs[key] = {
          id,
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
          mockCreate: function(data) {
            this.exists = true;
            this._data = { ...data };
            this.creates.push(data);
          },
          mockUpdate: function(data) {
            this._data = { ...this._data, ...data };
            this.updates.push(data);
          },
          setState: function(exists, data) {
            this.exists = exists;
            this._data = data;
            this.updates = [];
            this.creates = [];
          },
          updates: [],
          creates: []
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
                if (!runTests.bypassFilters) {
                  for (const filter of filters) {
                    if (doc._data[filter.field] !== filter.val) {
                      match = false;
                      break;
                    }
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

const { publishClassProgramDraft } = require('../../functions/lib/academic/publishClassProgramDraft.js');
const { computeDraftStateToken } = require('../../functions/lib/academic/draftStateToken.js');

async function runTests() {
  console.log('=== DÉMARRAGE DES TESTS DU LOT 2D ===');
  runTests.bypassFilters = false;
  let passed = 0;
  let failed = 0;

  async function testCase(name, setup, execute, verify) {
    console.log(`\nTEST : ${name}`);
    for (const key in docs) {
      delete docs[key];
    }
    // Inject mock academic year for all tests to satisfy resolveAcademicYear
    dbMock.collection('academicYears').doc('legacy-2026-2027').setState(true, {
      schoolId: 'school-1',
      name: '2026-2027'
    });
    try {
      setup();
      const result = await execute();
      verify(null, result);
      console.log(`✅ ${name} -> PASS`);
      passed++;
    } catch (err) {
      try {
        verify(err, null);
        console.log(`✅ ${name} -> PASS (Erreur attendue obtenue)`);
        passed++;
      } catch (checkErr) {
        console.error(`❌ ${name} -> FAIL`);
        console.error('Erreur obtenue :', err);
        console.error('Erreur de validation :', checkErr);
        failed++;
      }
    }
  }

  // === TESTS DE FONCTIONS PURES (SHA-256) ===

  await testCase(
    '1. Conformité croisée et valeur attendue fixe du SHA-256',
    () => {},
    async () => {
      const testSubjects = [
        {
          id: 'school-1__2026-2027__class-1__v1__subj-1',
          subjectId: 'subj-1',
          subjectNameSnapshot: 'Maths',
          isRequired: true,
          displayOrder: 1,
          isActive: true,
          revisionId: 'school-1__2026-2027__class-1__v1',
          revisionNumber: 1,
          coefficient: 4,
          weeklyHours: 3
        }
      ];
      
      const serverToken = computeDraftStateToken(testSubjects);
      // Hardcoded check for deterministic output hash
      return { serverToken };
    },
    (err, res) => {
      assert.ifError(err);
      assert.strictEqual(res.serverToken, '61e0cf7d6428309bcc3fb91415257835391e80ccf2cc10359e7b8b012beb9586');
    }
  );

  await testCase(
    '2. Jeton déterministe malgré l\'ordre des documents',
    () => {},
    async () => {
      const listA = [
        { id: 'subj-a', subjectId: 'a', subjectNameSnapshot: 'A', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'v1', revisionNumber: 1 },
        { id: 'subj-b', subjectId: 'b', subjectNameSnapshot: 'B', isRequired: true, displayOrder: 1, isActive: true, revisionId: 'v1', revisionNumber: 1 }
      ];
      const listB = [
        { id: 'subj-b', subjectId: 'b', subjectNameSnapshot: 'B', isRequired: true, displayOrder: 1, isActive: true, revisionId: 'v1', revisionNumber: 1 },
        { id: 'subj-a', subjectId: 'a', subjectNameSnapshot: 'A', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'v1', revisionNumber: 1 }
      ];
      return {
        tokenA: computeDraftStateToken(listA),
        tokenB: computeDraftStateToken(listB)
      };
    },
    (err, res) => {
      assert.ifError(err);
      assert.strictEqual(res.tokenA, res.tokenB);
    }
  );

  await testCase(
    '3. Modification de coefficient change le token',
    () => {},
    async () => {
      const base = [{ id: 'subj-a', subjectId: 'a', subjectNameSnapshot: 'A', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'v1', revisionNumber: 1 }];
      const mod = [{ id: 'subj-a', subjectId: 'a', subjectNameSnapshot: 'A', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'v1', revisionNumber: 1, coefficient: 5 }];
      return {
        tokenBase: computeDraftStateToken(base),
        tokenMod: computeDraftStateToken(mod)
      };
    },
    (err, res) => {
      assert.ifError(err);
      assert.notStrictEqual(res.tokenBase, res.tokenMod);
    }
  );

  await testCase(
    '4. Modification de displayOrder change le token',
    () => {},
    async () => {
      const base = [{ id: 'subj-a', subjectId: 'a', subjectNameSnapshot: 'A', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'v1', revisionNumber: 1 }];
      const mod = [{ id: 'subj-a', subjectId: 'a', subjectNameSnapshot: 'A', isRequired: true, displayOrder: 5, isActive: true, revisionId: 'v1', revisionNumber: 1 }];
      return {
        tokenBase: computeDraftStateToken(base),
        tokenMod: computeDraftStateToken(mod)
      };
    },
    (err, res) => {
      assert.ifError(err);
      assert.notStrictEqual(res.tokenBase, res.tokenMod);
    }
  );

  await testCase(
    '5. Modification de isActive change le token',
    () => {},
    async () => {
      const base = [{ id: 'subj-a', subjectId: 'a', subjectNameSnapshot: 'A', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'v1', revisionNumber: 1 }];
      const mod = [{ id: 'subj-a', subjectId: 'a', subjectNameSnapshot: 'A', isRequired: true, displayOrder: 0, isActive: false, revisionId: 'v1', revisionNumber: 1 }];
      return {
        tokenBase: computeDraftStateToken(base),
        tokenMod: computeDraftStateToken(mod)
      };
    },
    (err, res) => {
      assert.ifError(err);
      assert.notStrictEqual(res.tokenBase, res.tokenMod);
    }
  );

  await testCase(
    '6. Ajout/retrait de matière change le token',
    () => {},
    async () => {
      const base = [{ id: 'subj-a', subjectId: 'a', subjectNameSnapshot: 'A', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'v1', revisionNumber: 1 }];
      const mod = [
        { id: 'subj-a', subjectId: 'a', subjectNameSnapshot: 'A', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'v1', revisionNumber: 1 },
        { id: 'subj-b', subjectId: 'b', subjectNameSnapshot: 'B', isRequired: true, displayOrder: 1, isActive: true, revisionId: 'v1', revisionNumber: 1 }
      ];
      return {
        tokenBase: computeDraftStateToken(base),
        tokenMod: computeDraftStateToken(mod)
      };
    },
    (err, res) => {
      assert.ifError(err);
      assert.notStrictEqual(res.tokenBase, res.tokenMod);
    }
  );

  await testCase(
    '6a. Modification de subjectNameSnapshot change le token',
    () => {},
    async () => {
      const base = [{ id: 'subj-a', subjectId: 'a', subjectNameSnapshot: 'A', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'v1', revisionNumber: 1 }];
      const mod = [{ id: 'subj-a', subjectId: 'a', subjectNameSnapshot: 'A2', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'v1', revisionNumber: 1 }];
      return {
        tokenBase: computeDraftStateToken(base),
        tokenMod: computeDraftStateToken(mod)
      };
    },
    (err, res) => {
      assert.ifError(err);
      assert.notStrictEqual(res.tokenBase, res.tokenMod);
    }
  );

  await testCase(
    '6b. Modification uniquement de updatedAt / updatedBy ne change pas le token',
    () => {},
    async () => {
      const base = [{ id: 'subj-a', subjectId: 'a', subjectNameSnapshot: 'A', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'v1', revisionNumber: 1, updatedAt: '123', updatedBy: 'usr1' }];
      const mod = [{ id: 'subj-a', subjectId: 'a', subjectNameSnapshot: 'A', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'v1', revisionNumber: 1, updatedAt: '456', updatedBy: 'usr2' }];
      return {
        tokenBase: computeDraftStateToken(base),
        tokenMod: computeDraftStateToken(mod)
      };
    },
    (err, res) => {
      assert.ifError(err);
      assert.strictEqual(res.tokenBase, res.tokenMod);
    }
  );

  await testCase(
    '6c. Token client non hexadécimal ou mauvaise longueur refusé',
    () => {},
    () => publishClassProgramDraft({ schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v1', expectedDraftStateToken: 'not-hex' }, { auth: { uid: 'user-1' } }),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'invalid-argument');
      assert.strictEqual(err.details?.businessCode, 'INVALID_ARGUMENT');
    }
  );

  // === TESTS D'ERREURS ET VALIDATIONS ===

  await testCase(
    '7. Utilisateur non authentifié refusé',
    () => {},
    () => publishClassProgramDraft({ schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v1', expectedDraftStateToken: '9a77085ef17bc93be81a070bf3f7528e08d51624c965b2a0957af4ff0a96939b' }, {}),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'unauthenticated');
      assert.strictEqual(err.details?.businessCode, 'UNAUTHENTICATED');
    }
  );

  await testCase(
    '8. Enseignant (teacher) refusé',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'teacher', isActive: true, schoolId: 'school-1' });
    },
    () => publishClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v1', expectedDraftStateToken: '9a77085ef17bc93be81a070bf3f7528e08d51624c965b2a0957af4ff0a96939b' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'permission-denied');
      assert.strictEqual(err.details?.businessCode, 'PERMISSION_DENIED');
    }
  );

  await testCase(
    '9. Secrétaire autre école refusée',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-other' });
    },
    () => publishClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v1', expectedDraftStateToken: '9a77085ef17bc93be81a070bf3f7528e08d51624c965b2a0957af4ff0a96939b' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'permission-denied');
      assert.strictEqual(err.details?.businessCode, 'PERMISSION_DENIED');
    }
  );

  await testCase(
    '10. Utilisateur inactif refusé',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: false, schoolId: 'school-1' });
    },
    () => publishClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v1', expectedDraftStateToken: '9a77085ef17bc93be81a070bf3f7528e08d51624c965b2a0957af4ff0a96939b' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'permission-denied');
      assert.strictEqual(err.details?.businessCode, 'PERMISSION_DENIED');
    }
  );

  await testCase(
    '11. Classe inexistante refusée',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
    },
    () => publishClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v1', expectedDraftStateToken: '9a77085ef17bc93be81a070bf3f7528e08d51624c965b2a0957af4ff0a96939b' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'not-found');
      assert.strictEqual(err.details?.businessCode, 'CLASS_NOT_FOUND');
    }
  );

  await testCase(
    '12. Programme absent refusé',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
      dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
    },
    () => publishClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v1', expectedDraftStateToken: '9a77085ef17bc93be81a070bf3f7528e08d51624c965b2a0957af4ff0a96939b' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'not-found');
      assert.strictEqual(err.details?.businessCode, 'PROGRAM_NOT_FOUND');
    }
  );

  await testCase(
    '13. Programme sans matière refusé',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
      dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
      dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        status: 'draft', draftRevisionId: 'school-1__2026-2027__class-1__v1', draftRevisionNumber: 1,
        hasUnpublishedChanges: true
      });
    },
    () => publishClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v1', expectedDraftStateToken: '9a77085ef17bc93be81a070bf3f7528e08d51624c965b2a0957af4ff0a96939b' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'failed-precondition');
      assert.strictEqual(err.details?.businessCode, 'PROGRAM_NOT_READY');
    }
  );

  await testCase(
    '14. Aucune matière active refusée',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
      dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
      dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        status: 'draft', draftRevisionId: 'school-1__2026-2027__class-1__v1', draftRevisionNumber: 1,
        hasUnpublishedChanges: true
      });
      dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v1__subj-1').setState(true, {
        id: 'school-1__2026-2027__class-1__v1__subj-1',
        programId: 'school-1__2026-2027__class-1', schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        subjectId: 'subj-1', revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1,
        subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: false
      });
    },
    () => {
      const token = computeDraftStateToken([{
        id: 'school-1__2026-2027__class-1__v1__subj-1',
        subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: false,
        revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1
      }]);
      return publishClassProgramDraft(
        { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v1', expectedDraftStateToken: token },
        { auth: { uid: 'user-1' } }
      );
    },
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'failed-precondition');
      assert.strictEqual(err.details?.businessCode, 'NO_ACTIVE_SUBJECT');
    }
  );

  await testCase(
    '15. Jeton de révision différent (optimistic lock) refusé',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
      dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
      dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        status: 'draft', draftRevisionId: 'school-1__2026-2027__class-1__v1', draftRevisionNumber: 1,
        hasUnpublishedChanges: true
      });
      dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v1__subj-1').setState(true, {
        id: 'school-1__2026-2027__class-1__v1__subj-1',
        programId: 'school-1__2026-2027__class-1', schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        subjectId: 'subj-1', revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1,
        subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true
      });
    },
    () => publishClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v999', expectedDraftStateToken: '9a77085ef17bc93be81a070bf3f7528e08d51624c965b2a0957af4ff0a96939b' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'aborted');
      assert.strictEqual(err.details?.businessCode, 'DRAFT_CHANGED');
    }
  );

  await testCase(
    '16. Jeton d\'état différent (draftStateToken) refusé',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
      dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
      dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        status: 'draft', draftRevisionId: 'school-1__2026-2027__class-1__v1', draftRevisionNumber: 1,
        hasUnpublishedChanges: true
      });
      dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v1__subj-1').setState(true, {
        id: 'school-1__2026-2027__class-1__v1__subj-1',
        programId: 'school-1__2026-2027__class-1', schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        subjectId: 'subj-1', revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1,
        subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, coefficient: 2, weeklyHours: 4
      });
    },
    () => publishClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v1', expectedDraftStateToken: '0000000000000000000000000000000000000000000000000000000000000000' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'aborted');
      assert.strictEqual(err.details?.businessCode, 'DRAFT_CHANGED');
    }
  );

  // === NOUVEAU TEST SPÉCIFIQUE DES DOUBLONS ===

  await testCase(
    '16a. duplicate subjectId is rejected',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
      dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
      dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        status: 'draft', draftRevisionId: 'school-1__2026-2027__class-1__v1', draftRevisionNumber: 1,
        hasUnpublishedChanges: true
      });
      // two classSubjects with same subjectId 'subj-1'
      dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v1__subj-1').setState(true, {
        id: 'school-1__2026-2027__class-1__v1__subj-1',
        programId: 'school-1__2026-2027__class-1', schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        subjectId: 'subj-1', revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1,
        subjectNameSnapshot: 'Maths A', isRequired: true, displayOrder: 0, isActive: true, coefficient: 2, weeklyHours: 4
      });
      docs['classSubjects/school-1__2026-2027__class-1__v1__subj-1'].id = 'school-1__2026-2027__class-1__v1__subj-1';

      // Simulate duplicate document with a different map key but same actual id properties
      dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v1__subj-1-dup').setState(true, {
        id: 'school-1__2026-2027__class-1__v1__subj-1',
        programId: 'school-1__2026-2027__class-1', schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        subjectId: 'subj-1', revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1,
        subjectNameSnapshot: 'Maths B', isRequired: true, displayOrder: 1, isActive: true, coefficient: 2, weeklyHours: 4
      });
      docs['classSubjects/school-1__2026-2027__class-1__v1__subj-1-dup'].id = 'school-1__2026-2027__class-1__v1__subj-1';
    },
    () => {
      const token = computeDraftStateToken([
        {
          id: 'school-1__2026-2027__class-1__v1__subj-1',
          subjectId: 'subj-1', subjectNameSnapshot: 'Maths A', isRequired: true, displayOrder: 0, isActive: true, coefficient: 2, weeklyHours: 4,
          revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1
        },
        {
          id: 'school-1__2026-2027__class-1__v1__subj-1',
          subjectId: 'subj-1', subjectNameSnapshot: 'Maths B', isRequired: true, displayOrder: 1, isActive: true, coefficient: 2, weeklyHours: 4,
          revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1
        }
      ]);
      return publishClassProgramDraft(
        { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v1', expectedDraftStateToken: token },
        { auth: { uid: 'user-1' } }
      );
    },
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'failed-precondition');
      assert.strictEqual(err.details?.businessCode, 'DUPLICATE_SUBJECT');
      const parent = dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1');
      assert.strictEqual(parent.updates.length, 0); // No write!
    }
  );

  // === TESTS D'INTÉGRITÉ DÉTAILLÉS ===

  const integrityFixtures = [
    {
      name: 'document ID incohérent',
      subj: { id: 'wrong-id', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1 }
    },
    {
      name: 'programId incorrect',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', programId: 'wrong-program', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1 }
    },
    {
      name: 'schoolId incorrect',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', schoolId: 'wrong-school', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1 }
    },
    {
      name: 'classId incorrect',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', classId: 'wrong-class', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1 }
    },
    {
      name: 'academicYearId incorrect',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', academicYearId: 'wrong-year', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1 }
    },
    {
      name: 'revisionId incorrect',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'wrong-rev', revisionNumber: 1 }
    },
    {
      name: 'revisionNumber incorrect',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 0 }
    },
    {
      name: 'subjectNameSnapshot vide',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: '', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1 }
    },
    {
      name: 'isRequired non booléen',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: 'yes', displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1 }
    },
    {
      name: 'isActive non booléen',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: 'yes', revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1 }
    },
    {
      name: 'displayOrder négatif',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: -1, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1 }
    },
    {
      name: 'displayOrder non entier',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 1.5, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1 }
    },
    {
      name: 'coefficient négatif',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1, coefficient: -4 }
    },
    {
      name: 'coefficient zéro',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1, coefficient: 0 }
    },
    {
      name: 'coefficient non numérique',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1, coefficient: 'four' }
    },
    {
      name: 'coefficient null',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1, coefficient: null }
    },
    {
      name: 'weeklyHours négatif',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1, weeklyHours: -3 }
    },
    {
      name: 'weeklyHours zéro',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1, weeklyHours: 0 }
    },
    {
      name: 'weeklyHours non numérique',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1, weeklyHours: 'three' }
    },
    {
      name: 'weeklyHours null',
      subj: { id: 'school-1__2026-2027__class-1__v1__subj-1', subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1, weeklyHours: null }
    }
  ];

  for (let idx = 0; idx < integrityFixtures.length; idx++) {
    const f = integrityFixtures[idx];
    await testCase(
      `16_int_${idx + 1}. Intégrité: ${f.name}`,
      () => {
        dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
        dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
        dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
          id: 'school-1__2026-2027__class-1',
          schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
          status: 'draft', draftRevisionId: 'school-1__2026-2027__class-1__v1', draftRevisionNumber: 1,
          hasUnpublishedChanges: true
        });

        // Set subject in DB
        const dbSubj = {
          id: 'school-1__2026-2027__class-1__v1__subj-1',
          programId: 'school-1__2026-2027__class-1', schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
          subjectId: 'subj-1', revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1,
          subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true,
          ...f.subj
        };
        dbMock.collection('classSubjects').doc(dbSubj.id).setState(true, dbSubj);
      },
      () => {
        runTests.bypassFilters = true;
        // Compute correct token for the payload
        const inputSubj = {
          id: 'school-1__2026-2027__class-1__v1__subj-1',
          subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true,
          revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1,
          ...f.subj
        };
        const token = computeDraftStateToken([inputSubj]);
        return publishClassProgramDraft(
          { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v1', expectedDraftStateToken: token },
          { auth: { uid: 'user-1' } }
        ).finally(() => {
          runTests.bypassFilters = false;
        });
      },
      (err) => {
        assert.ok(err);
        assert.strictEqual(err.code, 'failed-precondition');
        assert.strictEqual(err.details?.businessCode, 'PROGRAM_INTEGRITY_ERROR');
        const parent = dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1');
        assert.strictEqual(parent.updates.length, 0); // No write!
      }
    );
  }

  // === TESTS TRANSACTIONNELS DE SUCCÈS ===

  await testCase(
    '17. Première publication v1 réussie',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
      dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
      
      const parentDoc = dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1');
      parentDoc.setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        status: 'draft', draftRevisionId: 'school-1__2026-2027__class-1__v1', draftRevisionNumber: 1,
        hasUnpublishedChanges: true,
        createdAt: '2026-07-24T00:00:00Z', createdBy: 'user-1',
        updatedAt: '2026-07-24T00:00:00Z', updatedBy: 'user-1'
      });

      const subject = {
        id: 'school-1__2026-2027__class-1__v1__subj-1',
        programId: 'school-1__2026-2027__class-1', schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        subjectId: 'subj-1', revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1,
        subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, coefficient: 2, weeklyHours: 4
      };
      dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v1__subj-1').setState(true, subject);
    },
    () => {
      const token = computeDraftStateToken([{
        id: 'school-1__2026-2027__class-1__v1__subj-1',
        subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, coefficient: 2, weeklyHours: 4,
        revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1
      }]);
      return publishClassProgramDraft(
        { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v1', expectedDraftStateToken: token },
        { auth: { uid: 'user-1' } }
      );
    },
    (err, res) => {
      assert.ifError(err);
      assert.strictEqual(res.published, true);
      assert.strictEqual(res.alreadyPublished, false);
      assert.strictEqual(res.publishedRevisionId, 'school-1__2026-2027__class-1__v1');
      assert.strictEqual(res.publishedRevisionNumber, 1);
      assert.strictEqual(res.activeSubjectCount, 1);
      assert.strictEqual(res.inactiveSubjectCount, 0);

      // Verify parent was updated to published
      const parent = dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1');
      assert.strictEqual(parent._data.status, 'published');
      assert.strictEqual(parent._data.publishedRevisionId, 'school-1__2026-2027__class-1__v1');
      assert.strictEqual(parent._data.publishedRevisionNumber, 1);
      assert.strictEqual(parent._data.hasUnpublishedChanges, false);
      assert.ok(parent._data.publishedAt);
      assert.strictEqual(parent._data.publishedBy, 'user-1');
    }
  );

  await testCase(
    '18. Publication de v2 après v1 réussie',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
      dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
      
      const parentDoc = dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1');
      parentDoc.setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        status: 'published', 
        publishedRevisionId: 'school-1__2026-2027__class-1__v1', publishedRevisionNumber: 1,
        draftRevisionId: 'school-1__2026-2027__class-1__v2', draftRevisionNumber: 2,
        hasUnpublishedChanges: true,
        createdAt: '2026-07-24T00:00:00Z', createdBy: 'user-1',
        updatedAt: '2026-07-24T00:00:00Z', updatedBy: 'user-1'
      });

      // Keep v1 subjects (should NOT be touched or deleted)
      dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v1__subj-1').setState(true, {
        id: 'school-1__2026-2027__class-1__v1__subj-1',
        programId: 'school-1__2026-2027__class-1', schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        subjectId: 'subj-1', revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1,
        subjectNameSnapshot: 'Maths v1', isRequired: true, displayOrder: 0, isActive: true, coefficient: 2, weeklyHours: 4
      });

      // v2 subjects to publish
      dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v2__subj-1').setState(true, {
        id: 'school-1__2026-2027__class-1__v2__subj-1',
        programId: 'school-1__2026-2027__class-1', schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        subjectId: 'subj-1', revisionId: 'school-1__2026-2027__class-1__v2', revisionNumber: 2,
        subjectNameSnapshot: 'Maths v2', isRequired: true, displayOrder: 0, isActive: true, coefficient: 2, weeklyHours: 4
      });
    },
    () => {
      const token = computeDraftStateToken([{
        id: 'school-1__2026-2027__class-1__v2__subj-1',
        subjectId: 'subj-1', subjectNameSnapshot: 'Maths v2', isRequired: true, displayOrder: 0, isActive: true, coefficient: 2, weeklyHours: 4,
        revisionId: 'school-1__2026-2027__class-1__v2', revisionNumber: 2
      }]);
      return publishClassProgramDraft(
        { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v2', expectedDraftStateToken: token },
        { auth: { uid: 'user-1' } }
      );
    },
    (err, res) => {
      assert.ifError(err);
      assert.strictEqual(res.published, true);
      assert.strictEqual(res.alreadyPublished, false);
      assert.strictEqual(res.publishedRevisionId, 'school-1__2026-2027__class-1__v2');
      assert.strictEqual(res.publishedRevisionNumber, 2);

      // Verify v1 subject is still there
      const v1Subj = dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v1__subj-1');
      assert.strictEqual(v1Subj.exists, true);
    }
  );

  await testCase(
    '19. Retry idempotent de publication réussie',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
      dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
      
      const parentDoc = dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1');
      parentDoc.setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        status: 'published', 
        publishedRevisionId: 'school-1__2026-2027__class-1__v1', publishedRevisionNumber: 1,
        draftRevisionId: 'school-1__2026-2027__class-1__v1', draftRevisionNumber: 1,
        hasUnpublishedChanges: false,
        publishedAt: '2026-07-25T01:00:00Z', publishedBy: 'user-1',
        createdAt: '2026-07-24T00:00:00Z', createdBy: 'user-1',
        updatedAt: '2026-07-24T00:00:00Z', updatedBy: 'user-1'
      });

      dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v1__subj-1').setState(true, {
        id: 'school-1__2026-2027__class-1__v1__subj-1',
        programId: 'school-1__2026-2027__class-1', schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        subjectId: 'subj-1', revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1,
        subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, coefficient: 2, weeklyHours: 4
      });
    },
    () => {
      const token = computeDraftStateToken([{
        id: 'school-1__2026-2027__class-1__v1__subj-1',
        subjectId: 'subj-1', subjectNameSnapshot: 'Maths', isRequired: true, displayOrder: 0, isActive: true, coefficient: 2, weeklyHours: 4,
        revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1
      }]);
      return publishClassProgramDraft(
        { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1', expectedDraftRevisionId: 'school-1__2026-2027__class-1__v1', expectedDraftStateToken: token },
        { auth: { uid: 'user-1' } }
      );
    },
    (err, res) => {
      assert.ifError(err);
      assert.strictEqual(res.published, false);
      assert.strictEqual(res.alreadyPublished, true);
      
      const parent = dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1');
      assert.strictEqual(parent._data.publishedAt, '2026-07-25T01:00:00Z'); // Inchangé !
    }
  );

  console.log(`\n=== BILAN DES TESTS ===\nRéussis : ${passed}\nÉchecs : ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
