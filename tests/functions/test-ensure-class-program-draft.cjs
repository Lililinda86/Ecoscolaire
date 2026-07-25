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
                for (const filter of filters) {
                  if (doc._data[filter.field] !== filter.val) {
                    match = false;
                    break;
                  }
                }
                if (match) {
                  matches.push({
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

const { ensureClassProgramDraft } = require('../../functions/lib/academic/ensureClassProgramDraft.js');

async function runTests() {
  console.log('=== DÉMARRAGE DES TESTS DU LOT 2C-B ===');
  let passed = 0;
  let failed = 0;

  async function testCase(name, setup, execute, verify) {
    console.log(`\nTEST : ${name}`);
    // Clear mock docs state
    for (const key in docs) {
      delete docs[key];
    }
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

  // 1. Non authentifié
  await testCase(
    '1. Utilisateur non authentifié refusé',
    () => {},
    () => ensureClassProgramDraft({ schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1' }, {}),
    (err) => {
      assert.ok(err, 'Doit retourner une erreur');
      assert.strictEqual(err.code, 'unauthenticated');
      assert.strictEqual(err.details?.businessCode, 'UNAUTHENTICATED');
    }
  );

  // 2. Rôle non autorisé
  await testCase(
    '2. Rôle enseignant (teacher) refusé',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, {
        id: 'user-1',
        role: 'teacher',
        isActive: true,
        schoolId: 'school-1'
      });
    },
    () => ensureClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err, 'Doit retourner une erreur');
      assert.strictEqual(err.code, 'permission-denied');
      assert.strictEqual(err.details?.businessCode, 'PERMISSION_DENIED');
    }
  );

  // 3. Autre école refusée
  await testCase(
    '3. Secrétaire d\'une autre école refusée',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, {
        id: 'user-1',
        role: 'secretary',
        isActive: true,
        schoolId: 'school-other'
      });
    },
    () => ensureClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err, 'Doit retourner une erreur');
      assert.strictEqual(err.code, 'permission-denied');
      assert.strictEqual(err.details?.businessCode, 'PERMISSION_DENIED');
    }
  );

  // 4. Classe inexistante
  await testCase(
    '4. Classe inexistante refusée',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, {
        id: 'user-1',
        role: 'secretary',
        isActive: true,
        schoolId: 'school-1'
      });
      // La classe n'est pas ajoutée
    },
    () => ensureClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'not-found');
      assert.strictEqual(err.details?.businessCode, 'CLASS_NOT_FOUND');
    }
  );

  // 5. Programme absent
  await testCase(
    '5. Programme absent refusé',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, {
        id: 'user-1',
        role: 'secretary',
        isActive: true,
        schoolId: 'school-1'
      });
      dbMock.collection('classes').doc('class-1').setState(true, {
        id: 'class-1',
        schoolId: 'school-1'
      });
      // Le programme n'est pas ajouté
    },
    () => ensureClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'not-found');
      assert.strictEqual(err.details?.businessCode, 'PROGRAM_NOT_FOUND');
    }
  );

  // 6. Programme non publié
  await testCase(
    '6. Programme non publié refusé',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, {
        id: 'user-1',
        role: 'secretary',
        isActive: true,
        schoolId: 'school-1'
      });
      dbMock.collection('classes').doc('class-1').setState(true, {
        id: 'class-1',
        schoolId: 'school-1'
      });
      dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1',
        classId: 'class-1',
        academicYearId: '2026-2027',
        status: 'draft',
        draftRevisionId: 'school-1__2026-2027__class-1__v1',
        draftRevisionNumber: 1,
        hasUnpublishedChanges: true
      });
    },
    () => ensureClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'failed-precondition');
      assert.strictEqual(err.details?.businessCode, 'PROGRAM_NOT_PUBLISHED');
    }
  );

  // 7. Brouillon déjà existant (idempotence)
  await testCase(
    '7. Brouillon déjà existant retourne created: false',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, {
        id: 'user-1',
        role: 'secretary',
        isActive: true,
        schoolId: 'school-1'
      });
      dbMock.collection('classes').doc('class-1').setState(true, {
        id: 'class-1',
        schoolId: 'school-1'
      });
      dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1',
        classId: 'class-1',
        academicYearId: '2026-2027',
        status: 'published',
        publishedRevisionId: 'school-1__2026-2027__class-1__v1',
        publishedRevisionNumber: 1,
        draftRevisionId: 'school-1__2026-2027__class-1__v2',
        draftRevisionNumber: 2,
        hasUnpublishedChanges: true
      });
    },
    () => ensureClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1' },
      { auth: { uid: 'user-1' } }
    ),
    (err, res) => {
      assert.ifError(err);
      assert.strictEqual(res.created, false);
      assert.strictEqual(res.draftRevisionId, 'school-1__2026-2027__class-1__v2');
      assert.strictEqual(res.draftRevisionNumber, 2);
    }
  );

  // 8. Clonage de révision publiée et création du brouillon
  await testCase(
    '8. Clonage de révision publiée réussi',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, {
        id: 'user-1',
        role: 'secretary',
        isActive: true,
        schoolId: 'school-1'
      });
      dbMock.collection('classes').doc('class-1').setState(true, {
        id: 'class-1',
        schoolId: 'school-1'
      });
      dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1',
        classId: 'class-1',
        academicYearId: '2026-2027',
        status: 'published',
        publishedRevisionId: 'school-1__2026-2027__class-1__v1',
        publishedRevisionNumber: 1,
        draftRevisionId: 'school-1__2026-2027__class-1__v1',
        draftRevisionNumber: 1,
        hasUnpublishedChanges: false
      });
      dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v1__subj-1').setState(true, {
        id: 'school-1__2026-2027__class-1__v1__subj-1',
        programId: 'school-1__2026-2027__class-1',
        schoolId: 'school-1',
        classId: 'class-1',
        academicYearId: '2026-2027',
        subjectId: 'subj-1',
        revisionId: 'school-1__2026-2027__class-1__v1',
        revisionNumber: 1,
        subjectNameSnapshot: 'Mathématiques',
        coefficient: 4,
        isRequired: true,
        displayOrder: 1,
        isActive: true
      });
    },
    () => ensureClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1' },
      { auth: { uid: 'user-1' } }
    ),
    (err, res) => {
      assert.ifError(err);
      assert.strictEqual(res.created, true);
      assert.strictEqual(res.draftRevisionId, 'school-1__2026-2027__class-1__v2');
      assert.strictEqual(res.draftRevisionNumber, 2);
      assert.strictEqual(res.clonedSubjectCount, 1);

      // Verify cloned subjects document
      const clonedSubject = dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v2__subj-1');
      assert.strictEqual(clonedSubject.exists, true);
      assert.strictEqual(clonedSubject._data.revisionId, 'school-1__2026-2027__class-1__v2');
      assert.strictEqual(clonedSubject._data.revisionNumber, 2);
      assert.strictEqual(clonedSubject._data.subjectNameSnapshot, 'Mathématiques');
      assert.strictEqual(clonedSubject._data.coefficient, 4);

      // Verify parent program document update
      const parent = dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1');
      assert.strictEqual(parent._data.draftRevisionId, 'school-1__2026-2027__class-1__v2');
      assert.strictEqual(parent._data.draftRevisionNumber, 2);
      assert.strictEqual(parent._data.hasUnpublishedChanges, true);
    }
  );

  // 9. Brouillon partiellement incohérent refusé
  await testCase(
    '9. Brouillon partiellement incohérent refusé',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
      dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
      dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1',
        classId: 'class-1',
        academicYearId: '2026-2027',
        status: 'published',
        publishedRevisionId: 'school-1__2026-2027__class-1__v1',
        publishedRevisionNumber: 1,
        draftRevisionId: 'school-1__2026-2027__class-1__v1',
        draftRevisionNumber: 1,
        hasUnpublishedChanges: true // INCOHÉRENT ! (devrait être false car draftRevisionId === publishedRevisionId)
      });
    },
    () => ensureClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'failed-precondition');
      assert.strictEqual(err.details?.businessCode, 'PROGRAM_INTEGRITY_ERROR');
    }
  );

  // 10. Collision révision cible
  await testCase(
    '10. Collision de révision cible refusée',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
      dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
      dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1',
        classId: 'class-1',
        academicYearId: '2026-2027',
        status: 'published',
        publishedRevisionId: 'school-1__2026-2027__class-1__v1',
        publishedRevisionNumber: 1,
        draftRevisionId: 'school-1__2026-2027__class-1__v1',
        draftRevisionNumber: 1,
        hasUnpublishedChanges: false
      });
      // Matières déjà présentes pour la révision v2 (cible)
      dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v2__subj-1').setState(true, {
        id: 'school-1__2026-2027__class-1__v2__subj-1',
        programId: 'school-1__2026-2027__class-1',
        schoolId: 'school-1',
        classId: 'class-1',
        academicYearId: '2026-2027',
        subjectId: 'subj-1',
        revisionId: 'school-1__2026-2027__class-1__v2',
        revisionNumber: 2,
        subjectNameSnapshot: 'Maths'
      });
    },
    () => ensureClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'aborted');
      assert.strictEqual(err.details?.businessCode, 'REVISION_CONFLICT');
    }
  );

  // 11. Matière publiée dupliquée refusée
  await testCase(
    '11. Matière publiée dupliquée refusée',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
      dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
      dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1',
        classId: 'class-1',
        academicYearId: '2026-2027',
        status: 'published',
        publishedRevisionId: 'school-1__2026-2027__class-1__v1',
        publishedRevisionNumber: 1,
        draftRevisionId: 'school-1__2026-2027__class-1__v1',
        draftRevisionNumber: 1,
        hasUnpublishedChanges: false
      });
      // Matières dupliquées pour la révision v1 (même subjectId)
      dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v1__subj-1a').setState(true, {
        id: 'school-1__2026-2027__class-1__v1__subj-1a',
        programId: 'school-1__2026-2027__class-1',
        schoolId: 'school-1',
        classId: 'class-1',
        academicYearId: '2026-2027',
        subjectId: 'subj-1',
        revisionId: 'school-1__2026-2027__class-1__v1',
        revisionNumber: 1,
        subjectNameSnapshot: 'Maths A',
        isRequired: true,
        displayOrder: 1,
        isActive: true
      });
      dbMock.collection('classSubjects').doc('school-1__2026-2027__class-1__v1__subj-1b').setState(true, {
        id: 'school-1__2026-2027__class-1__v1__subj-1b',
        programId: 'school-1__2026-2027__class-1',
        schoolId: 'school-1',
        classId: 'class-1',
        academicYearId: '2026-2027',
        subjectId: 'subj-1', // Doublon !
        revisionId: 'school-1__2026-2027__class-1__v1',
        revisionNumber: 1,
        subjectNameSnapshot: 'Maths B',
        isRequired: true,
        displayOrder: 2,
        isActive: true
      });
    },
    () => ensureClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'failed-precondition');
      assert.strictEqual(err.details?.businessCode, 'PROGRAM_INTEGRITY_ERROR');
    }
  );

  // 12. Propriétés client ignorées
  await testCase(
    '12. Propriétés client (role, userId, revisionNumber) ignorées',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, {
        id: 'user-1',
        role: 'secretary',
        isActive: true,
        schoolId: 'school-1'
      });
      dbMock.collection('classes').doc('class-1').setState(true, {
        id: 'class-1',
        schoolId: 'school-1'
      });
      dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1',
        classId: 'class-1',
        academicYearId: '2026-2027',
        status: 'published',
        publishedRevisionId: 'school-1__2026-2027__class-1__v1',
        publishedRevisionNumber: 1,
        draftRevisionId: 'school-1__2026-2027__class-1__v1',
        draftRevisionNumber: 1,
        hasUnpublishedChanges: false
      });
    },
    () => ensureClassProgramDraft(
      {
        schoolId: 'school-1',
        academicYearId: '2026-2027',
        classId: 'class-1',
        role: 'superAdmin', // Tentative de fraude role
        userId: 'fraud-user', // Tentative de fraude uid
        revisionNumber: 999 // Tentative de fraude revision
      },
      { auth: { uid: 'user-1' } }
    ),
    (err, res) => {
      assert.ifError(err);
      assert.strictEqual(res.created, true);
      assert.strictEqual(res.draftRevisionNumber, 2); // Doit calculer 2, pas 999
    }
  );

  // 13. 200 matières : accepté
  await testCase(
    '13. 200 matières accepté',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
      dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
      dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        status: 'published', publishedRevisionId: 'school-1__2026-2027__class-1__v1', publishedRevisionNumber: 1,
        draftRevisionId: 'school-1__2026-2027__class-1__v1', draftRevisionNumber: 1, hasUnpublishedChanges: false
      });
      // Add 200 subjects
      for (let i = 1; i <= 200; i++) {
        dbMock.collection('classSubjects').doc(`school-1__2026-2027__class-1__v1__subj-${i}`).setState(true, {
          id: `school-1__2026-2027__class-1__v1__subj-${i}`,
          programId: 'school-1__2026-2027__class-1', schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
          subjectId: `subj-${i}`, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1,
          subjectNameSnapshot: `Subj ${i}`, isRequired: true, displayOrder: i, isActive: true
        });
      }
    },
    () => ensureClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1' },
      { auth: { uid: 'user-1' } }
    ),
    (err, res) => {
      assert.ifError(err);
      assert.strictEqual(res.created, true);
      assert.strictEqual(res.clonedSubjectCount, 200);
    }
  );

  // 14. 201 matières : refusé
  await testCase(
    '14. 201 matières refusé',
    () => {
      dbMock.collection('users').doc('user-1').setState(true, { id: 'user-1', role: 'secretary', isActive: true, schoolId: 'school-1' });
      dbMock.collection('classes').doc('class-1').setState(true, { id: 'class-1', schoolId: 'school-1' });
      dbMock.collection('classPrograms').doc('school-1__2026-2027__class-1').setState(true, {
        id: 'school-1__2026-2027__class-1',
        schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
        status: 'published', publishedRevisionId: 'school-1__2026-2027__class-1__v1', publishedRevisionNumber: 1,
        draftRevisionId: 'school-1__2026-2027__class-1__v1', draftRevisionNumber: 1, hasUnpublishedChanges: false
      });
      // Add 201 subjects
      for (let i = 1; i <= 201; i++) {
        dbMock.collection('classSubjects').doc(`school-1__2026-2027__class-1__v1__subj-${i}`).setState(true, {
          id: `school-1__2026-2027__class-1__v1__subj-${i}`,
          programId: 'school-1__2026-2027__class-1', schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027',
          subjectId: `subj-${i}`, revisionId: 'school-1__2026-2027__class-1__v1', revisionNumber: 1,
          subjectNameSnapshot: `Subj ${i}`, isRequired: true, displayOrder: i, isActive: true
        });
      }
    },
    () => ensureClassProgramDraft(
      { schoolId: 'school-1', academicYearId: '2026-2027', classId: 'class-1' },
      { auth: { uid: 'user-1' } }
    ),
    (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'resource-exhausted');
      assert.strictEqual(err.details?.businessCode, 'PROGRAM_TOO_LARGE');
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
