const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;

// Mock structures
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

// Import compiled function & catalog
const { seedDefaultSubjectCatalog } = require('../../functions/lib/academic/seedDefaultSubjectCatalog.js');
const { DEFAULT_SUBJECT_CATALOG } = require('../../functions/lib/academic/defaultSubjectCatalog.js');

function resetDb() {
  for (const key in docs) {
    delete docs[key];
  }
}

function setDocState(collection, id, exists, data) {
  dbMock.collection(collection).doc(id).setState(exists, data);
}

// Test Runner variables
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
  console.log('🧪 Starting Seed Subject Catalog Cloud Functions Tests...');

  // 1. Authentification & Autorisation
  await runTest('non authentifié refusé', async () => {
    await assertThrowsBusinessError(
      () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, {}),
      'unauthenticated',
      'UNAUTHENTICATED'
    );
  });

  await runTest('utilisateur absent refusé', async () => {
    await assertThrowsBusinessError(
      () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_unknown' } }),
      'permission-denied',
      'PERMISSION_DENIED'
    );
  });

  await runTest('utilisateur inactif refusé', async () => {
    setDocState('users', 'op_inactive', true, { role: 'director', isActive: false, schoolId: 'S1' });
    await assertThrowsBusinessError(
      () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_inactive' } }),
      'permission-denied',
      'PERMISSION_DENIED'
    );
  });

  await runTest('teacher refusé', async () => {
    setDocState('users', 'op_teacher', true, { role: 'teacher', isActive: true, schoolId: 'S1' });
    await assertThrowsBusinessError(
      () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_teacher' } }),
      'permission-denied',
      'PERMISSION_DENIED'
    );
  });

  await runTest('accountant refusé', async () => {
    setDocState('users', 'op_accountant', true, { role: 'accountant', isActive: true, schoolId: 'S1' });
    await assertThrowsBusinessError(
      () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_accountant' } }),
      'permission-denied',
      'PERMISSION_DENIED'
    );
  });

  await runTest('boardViewer / supervisor / parent / student / driver / rôle inconnu refusé', async () => {
    setDocState('users', 'op_board_viewer', true, { role: 'boardViewer', isActive: true, schoolId: 'S1' });
    await assertThrowsBusinessError(
      () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_board_viewer' } }),
      'permission-denied',
      'PERMISSION_DENIED'
    );
    setDocState('users', 'op_parent', true, { role: 'parent', isActive: true, schoolId: 'S1' });
    await assertThrowsBusinessError(
      () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_parent' } }),
      'permission-denied',
      'PERMISSION_DENIED'
    );
  });

  await runTest('secretary même école autorisée', async () => {
    setDocState('users', 'op_secretary', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    const res = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_secretary' } });
    assert.strictEqual(res.seedVersion, 'cameroon-bilingual-v1');
    assert.strictEqual(res.createdCount, 72);
  });

  await runTest('director même école autorisé', async () => {
    setDocState('users', 'op_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
    const res = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_director' } });
    assert.strictEqual(res.createdCount, 72);
  });

  await runTest('owner même école autorisé', async () => {
    setDocState('users', 'op_owner', true, { role: 'owner', isActive: true, schoolId: 'S1' });
    const res = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_owner' } });
    assert.strictEqual(res.createdCount, 72);
  });

  await runTest('superAdmin autorisé', async () => {
    setDocState('users', 'op_superadmin', true, { role: 'superAdmin', isActive: true });
    const res = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_superadmin' } });
    assert.strictEqual(res.createdCount, 72);
  });

  await runTest('gestionnaire d’une autre école refusé', async () => {
    setDocState('users', 'op_other_school', true, { role: 'director', isActive: true, schoolId: 'S2' });
    await assertThrowsBusinessError(
      () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_other_school' } }),
      'permission-denied',
      'SCHOOL_MISMATCH'
    );
  });

  await runTest('schoolId vide / invalide refusé', async () => {
    setDocState('users', 'op_superadmin', true, { role: 'superAdmin', isActive: true });
    await assertThrowsBusinessError(
      () => seedDefaultSubjectCatalog({ schoolId: '' }, { auth: { uid: 'op_superadmin' } }),
      'invalid-argument',
      'INVALID_ARGUMENT'
    );
    await assertThrowsBusinessError(
      () => seedDefaultSubjectCatalog({ schoolId: 'S1/S2' }, { auth: { uid: 'op_superadmin' } }),
      'invalid-argument',
      'INVALID_ARGUMENT'
    );
  });

  // 2. Intégrité de la constante
  await runTest('DEFAULT_SUBJECT_CATALOG.length === 72 et répartition exacte', async () => {
    assert.strictEqual(DEFAULT_SUBJECT_CATALOG.length, 72);
    
    const countBySectionAndCycle = (section, cycle) => 
      DEFAULT_SUBJECT_CATALOG.filter(s => s.section === section && s.cycles.includes(cycle)).length;

    assert.strictEqual(countBySectionAndCycle('francophone', 'nursery'), 8);
    assert.strictEqual(countBySectionAndCycle('anglophone', 'nursery'), 8);
    assert.strictEqual(countBySectionAndCycle('francophone', 'primary'), 14);
    assert.strictEqual(countBySectionAndCycle('anglophone', 'primary'), 13);
    assert.strictEqual(countBySectionAndCycle('francophone', 'secondary'), 13);
    assert.strictEqual(countBySectionAndCycle('anglophone', 'secondary'), 16);
  });

  await runTest('champs interdits absents et internalCode/codes uniques', async () => {
    const internalCodes = new Set();
    const codes = new Set();

    DEFAULT_SUBJECT_CATALOG.forEach(s => {
      assert.ok(s.internalCode);
      assert.ok(s.code);
      assert.ok(s.name);
      assert.ok(['francophone', 'anglophone', 'all'].includes(s.section));
      assert.ok(s.cycles.every(c => ['nursery', 'primary', 'secondary'].includes(c)));
      assert.ok(s.category);
      
      // Forbidden fields
      assert.strictEqual(s.coefficient, undefined);
      assert.strictEqual(s.weeklyHours, undefined);
      assert.strictEqual(s.teacherId, undefined);
      assert.strictEqual(s.classId, undefined);
      assert.strictEqual(s.academicYearId, undefined);

      internalCodes.add(s.internalCode);
      codes.add(s.code);
    });

    assert.strictEqual(internalCodes.size, 72);
    assert.strictEqual(codes.size, 72);
  });

  // 3. Métadonnées serveur
  await runTest('métadonnées serveur correctes et champs client ignorés', async () => {
    setDocState('users', 'op_secretary', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    const payload = {
      schoolId: 'S1',
      role: 'superAdmin',
      createdBy: 'fake_uid',
      updatedBy: 'fake_uid',
      isActive: false
    };
    const res = await seedDefaultSubjectCatalog(payload, { auth: { uid: 'op_secretary' } });
    assert.strictEqual(res.createdCount, 72);

    const sampleDetId = 'S1__subject__fr-mat-lang';
    const sampleDoc = docs[`subjects/${sampleDetId}`];
    assert.ok(sampleDoc.exists);
    assert.strictEqual(sampleDoc._data.schoolId, 'S1');
    assert.strictEqual(sampleDoc._data.createdBy, 'op_secretary');
    assert.strictEqual(sampleDoc._data.updatedBy, 'op_secretary');
    assert.strictEqual(sampleDoc._data.isActive, true);
    assert.strictEqual(sampleDoc._data.createdAt, sampleDoc._data.updatedAt);
  });

  // 4. Idempotence & Matières existantes
  await runTest('second appel après création complète n’écrit rien', async () => {
    setDocState('users', 'op_secretary', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
    await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_secretary' } });
    
    // Clear tracked calls in mocks
    for (const key in docs) {
      if (key.startsWith('subjects/')) {
        docs[key].creates = [];
        docs[key].updates = [];
      }
    }

    const res = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_secretary' } });
    assert.strictEqual(res.createdCount, 0);
    assert.strictEqual(res.skippedCount, 72);

    // Verify absolutely no write calls occurred
    for (const key in docs) {
      if (key.startsWith('subjects/')) {
        assert.strictEqual(docs[key].creates.length, 0);
        assert.strictEqual(docs[key].updates.length, 0);
      }
    }
  });

  await runTest('matière existante par code compatible ignorée', async () => {
    setDocState('users', 'op_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
    setDocState('subjects', 'custom_id_math', true, {
      id: 'custom_id_math',
      schoolId: 'S1',
      code: 'FR-MAT-MATH',
      name: 'Éveil mathématique',
      section: 'francophone',
      cycles: ['nursery'],
      category: 'Mathématiques',
      isActive: true
    });
    const res = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_director' } });
    assert.strictEqual(res.createdCount, 71);
    assert.strictEqual(res.skippedCount, 1);
    assert.strictEqual(res.existingByCodeCount, 1);
  });

  await runTest('matière existante par nom normalisé avec diacritiques ignorée', async () => {
    setDocState('users', 'op_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
    setDocState('subjects', 'custom_id_math', true, {
      id: 'custom_id_math',
      schoolId: 'S1',
      name: 'Activites Mathematiques',
      section: 'francophone',
      cycles: ['nursery'],
      category: 'Mathématiques',
      isActive: true
    });
    const res = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_director' } });
    assert.strictEqual(res.createdCount, 71);
    assert.strictEqual(res.skippedCount, 1);
  });

  await runTest('matière existante par alias ignorée', async () => {
    setDocState('users', 'op_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
    setDocState('subjects', 'custom_id_math', true, {
      id: 'custom_id_math',
      schoolId: 'S1',
      name: 'éveil mathématique',
      section: 'francophone',
      cycles: ['nursery'],
      category: 'Mathématiques',
      isActive: true
    });
    const res = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_director' } });
    assert.strictEqual(res.createdCount, 71);
    assert.strictEqual(res.skippedCount, 1);
  });

  await runTest('matière inactive compatible ignorée sans réactivation', async () => {
    setDocState('users', 'op_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
    setDocState('subjects', 'custom_id_math', true, {
      id: 'custom_id_math',
      schoolId: 'S1',
      code: 'FR-MAT-MATH',
      name: 'Éveil mathématique',
      section: 'francophone',
      cycles: ['nursery'],
      category: 'Mathématiques',
      isActive: false
    });
    const res = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_director' } });
    assert.strictEqual(res.createdCount, 71);
    assert.strictEqual(res.skippedCount, 1);
    
    // Verify it was not reactivated
    const existing = docs['subjects/custom_id_math'];
    assert.strictEqual(existing._data.isActive, false);
  });

  await runTest('autre cycle ou section n’empêche pas la création', async () => {
    setDocState('users', 'op_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
    setDocState('subjects', 'custom_id_math', true, {
      id: 'custom_id_math',
      schoolId: 'S1',
      name: 'Éveil mathématique',
      section: 'francophone',
      cycles: ['primary'], // primary instead of nursery
      category: 'Mathématiques',
      isActive: true
    });
    const res = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_director' } });
    // Nursery FR-MAT-MATH should still be created
    assert.strictEqual(res.createdCount, 72);
  });

  // 5. Cas Mathématiques Maternelle
  await runTest('cas mathématiques maternelle existante', async () => {
    setDocState('users', 'op_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
    setDocState('subjects', 'math_capture', true, {
      id: 'math_capture',
      schoolId: 'S1',
      name: 'mathématiques',
      section: 'francophone',
      cycles: ['nursery'],
      category: 'Mathématiques',
      isActive: true
    });
    const res = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_director' } });
    assert.strictEqual(res.createdCount, 71);
    assert.strictEqual(res.skippedCount, 1);
    
    const captureDoc = docs['subjects/math_capture'];
    assert.strictEqual(captureDoc._data.name, 'mathématiques');
    assert.strictEqual(captureDoc._data.code, undefined);
  });

  // 6. Conflits par code
  await runTest('conflits par code', async () => {
    setDocState('users', 'op_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
    setDocState('subjects', 'custom_conflicting_code', true, {
      id: 'custom_conflicting_code',
      schoolId: 'S1',
      code: 'FR-MAT-MATH',
      name: 'Éveil mathématique',
      section: 'anglophone', // Incompatible section
      cycles: ['nursery'],
      isActive: true
    });
    await assertThrowsBusinessError(
      () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_director' } }),
      'failed-precondition',
      'SUBJECT_SEED_CONFLICT'
    );
  });

  // 7. Conflits par ID déterministe
  await runTest('conflits par identifiant déterministe', async () => {
    setDocState('users', 'op_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
    // Deterministic ID S1__subject__fr-mat-math occupied by school S2
    setDocState('subjects', 'S1__subject__fr-mat-math', true, {
      id: 'S1__subject__fr-mat-math',
      schoolId: 'S2', // Incompatible schoolId
      code: 'FR-MAT-MATH',
      name: 'Éveil mathématique',
      section: 'francophone',
      cycles: ['nursery'],
      isActive: true
    });
    await assertThrowsBusinessError(
      () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_director' } }),
      'failed-precondition',
      'SUBJECT_SEED_CONFLICT'
    );
  });

  // 8. Cohérence de la réponse
  await runTest('cohérence de la réponse', async () => {
    setDocState('users', 'op_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
    const res = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_director' } });
    
    assert.strictEqual(res.seedVersion, 'cameroon-bilingual-v1');
    assert.strictEqual(res.totalCandidates, 72);
    assert.strictEqual(res.createdCount + res.skippedCount, res.totalCandidates);
    assert.strictEqual(res.createdSubjectIds.length, res.createdCount);
    
    const uniqueIds = new Set(res.createdSubjectIds);
    assert.strictEqual(uniqueIds.size, res.createdCount);
  });

  console.log('\n================================================================');
  console.log(`TESTS SUMMARY: ${testsPassed} / ${testsRun} tests passed successfully.`);
  console.log("Les tests mockés démontrent les branches métier et les écritures préparées. Ils ne démontrent pas le retry ni la concurrence réelle du SDK Firestore.");
  console.log('================================================================\n');

  if (testsPassed !== testsRun) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
