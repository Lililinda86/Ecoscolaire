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
      update: (ref, data) => ref.mockUpdate(data),
      set: (ref, data) => ref.mockSet(data)
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
          setState: function(exists, data) {
            this.exists = exists;
            this._data = data;
            this.updates = [];
            this.creates = [];
            this.sets = [];
          },
          updates: [],
          creates: [],
          sets: []
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
        limit: function(num) {
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
            size: matches.length,
            docs: matches
          };
        },
        get: async function() {
          return this.mockGet();
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
  if (name === 'firebase-admin') return adminMock;
  if (name === 'firebase-functions') return functionsMock;
  return originalRequire.apply(this, arguments);
};

const { bulkAddSubjectsToClasses } = require('../../functions/lib/academic/bulkAddSubjectsToClasses');

function setDocState(path, id, exists, data) {
  const key = `${path}/${id}`;
  dbMock.collection(path).doc(id).setState(exists, data);
}

function clearDocs() {
  for (const k in docs) delete docs[k];
}

async function runTests() {
  console.log('=== DÉMARRAGE DES TESTS DU SUITE BULK ADD SUBJECTS ===\n');
  let passed = 0;
  let failed = 0;

  async function test(title, fn) {
    clearDocs();
    console.log(`TEST : ${title}`);
    try {
      await fn();
      console.log(`✅ ${title} -> PASS\n`);
      passed++;
    } catch (err) {
      console.error(`❌ ${title} -> FAIL: ${err.message}\n`, err);
      failed++;
    }
  }

  const contextSec = { auth: { uid: 'user_sec' } };
  const baseUser = { role: 'secretary', isActive: true, schoolId: 'S1' };
  const baseYear = { schoolId: 'S1', name: '2026-2027', status: 'utilisable' };

  // 1. ID canonique valide accepté
  await test('1. ID canonique valide accepté', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.classesProcessed, 1);
    assert.strictEqual(res.totalSubjectsAdded, 1);
    assert.strictEqual(res.details[0].status, 'success');
  });

  // 2. Libellé legacy valide accepté
  await test('2. Libellé legacy valide accepté', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_legacy_123', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: '2026-2027', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.classesProcessed, 1);
    assert.strictEqual(res.totalSubjectsAdded, 1);
  });

  // 3. Année inexistante refusée
  await test('3. Année inexistante refusée', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_nonexistent', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.details[0].status, 'error');
  });

  // 4. Année d’une autre école refusée
  await test('4. Année d’une autre école refusée', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S2_2026-2027_xyz', true, { schoolId: 'S2', name: '2026-2027' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S2_2026-2027_xyz', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.details[0].status, 'error');
  });

  // 5. Document d’année avec name invalide refusé
  await test('5. Document d’année avec name invalide refusé', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_bad_name', true, { schoolId: 'S1', name: 'INVALID_YEAR' });
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_bad_name', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.details[0].status, 'error');
  });

  // 6. Programme avec document ID legacy et champ année canonique réutilisé
  await test('6. Programme avec document ID legacy et champ année canonique réutilisé', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });
    setDocState('classPrograms', 'legacy_prog_id_999', true, {
      schoolId: 'S1',
      classId: 'C1',
      academicYearId: 'ay_S1_2026-2027_abc',
      status: 'draft',
      draftRevisionId: 'legacy_prog_id_999__v1',
      draftRevisionNumber: 1,
      hasUnpublishedChanges: true
    });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.details[0].status, 'success');
    assert.strictEqual(res.totalSubjectsAdded, 1);
    assert.strictEqual(docs['classPrograms/legacy_prog_id_999'].exists, true);
  });

  // 7. Véritable classProgramId conservé
  await test('7. Véritable classProgramId conservé', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });
    setDocState('classPrograms', 'custom_prog_id', true, {
      schoolId: 'S1',
      classId: 'C1',
      academicYearId: 'ay_S1_2026-2027_abc',
      status: 'draft',
      draftRevisionId: 'custom_prog_id__v1',
      draftRevisionNumber: 1,
      hasUnpublishedChanges: true
    });

    await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(docs['classSubjects/custom_prog_id__v1__SUB1'].exists, true);
  });

  // 8. Programme retrouvé via champ legacy
  await test('8. Programme retrouvé via champ legacy', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });
    setDocState('classPrograms', 'legacy_year_name_prog', true, {
      schoolId: 'S1',
      classId: 'C1',
      academicYearId: '2026-2027',
      status: 'draft',
      draftRevisionId: 'legacy_year_name_prog__v1',
      draftRevisionNumber: 1,
      hasUnpublishedChanges: true
    });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.details[0].status, 'success');
    assert.strictEqual(docs['classSubjects/legacy_year_name_prog__v1__SUB1'].exists, true);
  });

  // 9. Aucun second programme créé
  await test('9. Aucun second programme créé', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });
    setDocState('classPrograms', 'existing_prog', true, {
      schoolId: 'S1',
      classId: 'C1',
      academicYearId: 'ay_S1_2026-2027_abc',
      status: 'draft',
      draftRevisionId: 'existing_prog__v1',
      draftRevisionNumber: 1,
      hasUnpublishedChanges: true
    });

    await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );

    // Check that no deterministic doc S1__2026-2027__C1 was created in addition
    assert.strictEqual(docs['classPrograms/S1__2026-2027__C1'] ? docs['classPrograms/S1__2026-2027__C1'].exists : false, false);
  });

  // 10. Collision entre deux programmes distincts refusée
  await test('10. Collision entre deux programmes distincts refusée', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });
    setDocState('classPrograms', 'prog1', true, { schoolId: 'S1', classId: 'C1', academicYearId: 'ay_S1_2026-2027_abc' });
    setDocState('classPrograms', 'prog2', true, { schoolId: 'S1', classId: 'C1', academicYearId: '2026-2027' });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.details[0].status, 'error');
    assert.ok(res.details[0].error.includes('PROGRAM_INTEGRITY_ERROR') || res.details[0].error.includes('distincts'));
  });

  // 11. ID canonique envoyé par le frontend
  await test('11. ID canonique envoyé par le frontend', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_school-italo-official_2026-2027_er0p', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_school-italo-official_2026-2027_er0p', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.details[0].status, 'success');
  });

  // 12. Ajout à une seule classe
  await test('12. Ajout à une seule classe', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.classesProcessed, 1);
    assert.strictEqual(res.totalSubjectsAdded, 1);
  });

  // 13. Ajout à plusieurs classes
  await test('13. Ajout à plusieurs classes', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('classes', 'C2', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1', 'C2'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.classesProcessed, 2);
    assert.strictEqual(res.totalSubjectsAdded, 2);
  });

  // 14. Doublon de matière ignoré selon le contrat existant
  await test('14. Doublon de matière ignoré selon le contrat existant', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });
    setDocState('classPrograms', 'S1__2026-2027__C1', true, {
      schoolId: 'S1', classId: 'C1', academicYearId: 'ay_S1_2026-2027_abc',
      status: 'draft', draftRevisionId: 'S1__2026-2027__C1__v1', draftRevisionNumber: 1, hasUnpublishedChanges: true
    });
    setDocState('classSubjects', 'S1__2026-2027__C1__v1__SUB1', true, {
      subjectId: 'SUB1', isActive: true, programId: 'S1__2026-2027__C1', revisionId: 'S1__2026-2027__C1__v1'
    });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.totalSubjectsAdded, 0);
    assert.strictEqual(res.totalDuplicatesIgnored, 1);
  });

  // 15. Matière nouvelle ajoutée une seule fois
  await test('15. Matière nouvelle ajoutée une seule fois', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.totalSubjectsAdded, 1);
    assert.strictEqual(docs['classSubjects/S1__2026-2027__C1__v1__SUB1'].exists, true);
  });

  // 16. Compteur classes traitées correct
  await test('16. Compteur classes traitées correct', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('classes', 'C2', true, { schoolId: 'S1', isActive: true });
    setDocState('classes', 'C3', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1', 'C2', 'C3'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.classesProcessed, 3);
  });

  // 17. Compteur matières ajoutées correct
  await test('17. Compteur matières ajoutées correct', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });
    setDocState('subjects', 'SUB2', true, { schoolId: 'S1', name: 'Physique' });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1'], subjectIds: ['SUB1', 'SUB2'] },
      contextSec
    );
    assert.strictEqual(res.totalSubjectsAdded, 2);
  });

  // 18. Compteur doublons ignorés correct
  await test('18. Compteur doublons ignorés correct', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });
    setDocState('subjects', 'SUB2', true, { schoolId: 'S1', name: 'Physique' });
    setDocState('classPrograms', 'S1__2026-2027__C1', true, {
      schoolId: 'S1', classId: 'C1', academicYearId: 'ay_S1_2026-2027_abc',
      status: 'draft', draftRevisionId: 'S1__2026-2027__C1__v1', draftRevisionNumber: 1, hasUnpublishedChanges: true
    });
    setDocState('classSubjects', 'S1__2026-2027__C1__v1__SUB1', true, {
      subjectId: 'SUB1', isActive: true, programId: 'S1__2026-2027__C1', revisionId: 'S1__2026-2027__C1__v1'
    });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1'], subjectIds: ['SUB1', 'SUB2'] },
      contextSec
    );
    assert.strictEqual(res.totalSubjectsAdded, 1);
    assert.strictEqual(res.totalDuplicatesIgnored, 1);
  });

  // 19. Année invalide : zéro écriture
  await test('19. Année invalide : zéro écriture', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_invalid_year', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.details[0].status, 'error');
    assert.strictEqual(docs['classPrograms/S1__2026-2027__C1'] ? docs['classPrograms/S1__2026-2027__C1'].exists : false, false);
  });

  // 20. Erreur d’une classe gérée selon le contrat actuel
  await test('20. Erreur d’une classe gérée selon le contrat actuel', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    // C2 does NOT exist
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });

    const res = await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1', 'C2'], subjectIds: ['SUB1'] },
      contextSec
    );
    assert.strictEqual(res.classesProcessed, 2);
    assert.strictEqual(res.details[0].status, 'success');
    assert.strictEqual(res.details[1].status, 'error');
    assert.strictEqual(res.details[1].error, 'CLASS_NOT_FOUND');
  });

  // 21. Aucune publication automatique
  await test('21. Aucune publication automatique', async () => {
    setDocState('users', 'user_sec', true, baseUser);
    setDocState('academicYears', 'ay_S1_2026-2027_abc', true, baseYear);
    setDocState('classes', 'C1', true, { schoolId: 'S1', isActive: true });
    setDocState('subjects', 'SUB1', true, { schoolId: 'S1', name: 'Maths' });

    await bulkAddSubjectsToClasses(
      { schoolId: 'S1', academicYearId: 'ay_S1_2026-2027_abc', classIds: ['C1'], subjectIds: ['SUB1'] },
      contextSec
    );
    const progDoc = docs['classPrograms/S1__2026-2027__C1']._data;
    assert.strictEqual(progDoc.status, 'draft');
    assert.strictEqual(progDoc.publishedRevisionId, undefined);
    assert.strictEqual(progDoc.hasUnpublishedChanges, true);
  });

  console.log(`=== BILAN DES TESTS ===\nRéussis : ${passed}\nÉchecs : ${failed}`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
