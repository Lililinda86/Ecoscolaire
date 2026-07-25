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
        // Handle document references
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

async function runTests() {
  console.log('🧪 Starting Seed Subject Catalog Cloud Functions Tests...');

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
  // AUTHENTIFICATION & AUTORISATION
  // -------------------------------------------------------------
  
  // 1. non authentifié refusé
  await assertThrowsBusinessError(
    () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, {}),
    'unauthenticated',
    'UNAUTHENTICATED'
  );

  // Set up common operators
  setDocState('users', 'op_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
  setDocState('users', 'op_teacher', true, { role: 'teacher', isActive: true, schoolId: 'S1' });
  setDocState('users', 'op_accountant', true, { role: 'accountant', isActive: true, schoolId: 'S1' });
  setDocState('users', 'op_secretary', true, { role: 'secretary', isActive: true, schoolId: 'S1' });
  setDocState('users', 'op_inactive', true, { role: 'director', isActive: false, schoolId: 'S1' });
  setDocState('users', 'op_other_school', true, { role: 'director', isActive: true, schoolId: 'S2' });
  setDocState('users', 'op_superadmin', true, { role: 'superAdmin', isActive: true });

  // 2. teacher refusé
  await assertThrowsBusinessError(
    () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_teacher' } }),
    'permission-denied',
    'PERMISSION_DENIED'
  );

  // 3. accountant refusé
  await assertThrowsBusinessError(
    () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_accountant' } }),
    'permission-denied',
    'PERMISSION_DENIED'
  );

  // 4. secretary même école autorisée
  // We'll verify this during the execution tests.
  
  // 5. secretary autre école refusée
  await assertThrowsBusinessError(
    () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_other_school' } }),
    'permission-denied',
    'SCHOOL_MISMATCH'
  );

  // 6. gestionnaire inactif refusé
  await assertThrowsBusinessError(
    () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_inactive' } }),
    'permission-denied',
    'PERMISSION_DENIED'
  );

  // -------------------------------------------------------------
  // INTÉGRITÉ DE LA CONSTANTE
  // -------------------------------------------------------------
  
  // 8. totalCandidates égal à DEFAULT_SUBJECT_CATALOG.length
  // 9. total exact de 72
  assert.strictEqual(DEFAULT_SUBJECT_CATALOG.length, 72, 'DEFAULT_SUBJECT_CATALOG must have exactly 72 subjects');

  // 10. internalCode uniques, 11. codes uniques
  const internalCodes = new Set();
  const codes = new Set();
  DEFAULT_SUBJECT_CATALOG.forEach(s => {
    assert.ok(s.internalCode, 'Every subject must have internalCode');
    assert.ok(s.code, 'Every subject must have code');
    assert.ok(s.name, 'Every subject must have name');
    assert.ok(s.section, 'Every subject must have section');
    assert.ok(s.cycles && s.cycles.length > 0, 'Every subject must have at least one cycle');
    assert.ok(s.category, 'Every subject must have category');

    internalCodes.add(s.internalCode);
    codes.add(s.code);
  });
  assert.strictEqual(internalCodes.size, 72, 'internalCodes must be unique');
  assert.strictEqual(codes.size, 72, 'codes must be unique');

  // -------------------------------------------------------------
  // CRÉATION DE LA SEED
  // -------------------------------------------------------------
  
  // 18. catalogue vide crée 72 matières
  const result = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_secretary' } });
  assert.strictEqual(result.seedVersion, 'cameroon-bilingual-v1');
  assert.strictEqual(result.totalCandidates, 72);
  assert.strictEqual(result.createdCount, 72);
  assert.strictEqual(result.skippedCount, 0);

  // 19. schoolId, 21. createdBy, 22. IDs déterministes sur chaque document
  const sampleDetId = 'S1__subject__fr-mat-lang';
  const sampleDoc = docs[`subjects/${sampleDetId}`];
  assert.ok(sampleDoc && sampleDoc.exists, 'Deterministic document must exist');
  assert.strictEqual(sampleDoc._data.schoolId, 'S1');
  assert.strictEqual(sampleDoc._data.createdBy, 'op_secretary');
  assert.strictEqual(sampleDoc._data.isActive, true);

  // -------------------------------------------------------------
  // IDEMPOTENCE
  // -------------------------------------------------------------
  
  // 25. second appel crée zéro matière
  const result2 = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_secretary' } });
  assert.strictEqual(result2.createdCount, 0);
  assert.strictEqual(result2.skippedCount, 72);

  // Clean DB for specific idempotency tests
  resetDb();
  setDocState('users', 'op_director', true, { role: 'director', isActive: true, schoolId: 'S1' });

  // 26. matière existante par code compatible ignorée
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
  const resCodeIdempotent = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_director' } });
  assert.strictEqual(resCodeIdempotent.createdCount, 71);
  assert.strictEqual(resCodeIdempotent.skippedCount, 1);
  assert.strictEqual(resCodeIdempotent.existingByCodeCount, 1);

  // 27. matière existante par nom identique / alias / casse / accents ignorée
  resetDb();
  setDocState('users', 'op_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
  // Set existing subject with different accent and typography
  setDocState('subjects', 'custom_id_math', true, {
    id: 'custom_id_math',
    schoolId: 'S1',
    name: 'activites mathematiques',
    section: 'francophone',
    cycles: ['nursery'],
    category: 'Mathématiques',
    isActive: true
  });
  const resAliasIdempotent = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_director' } });
  assert.strictEqual(resAliasIdempotent.createdCount, 71);
  assert.strictEqual(resAliasIdempotent.skippedCount, 1);
  assert.strictEqual(resAliasIdempotent.existingByAliasCount, 1);

  // 37. mathématiques francophone maternelle empêche Éveil mathématique (cas existant de la capture)
  resetDb();
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
  const resCapture = await seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_director' } });
  assert.strictEqual(resCapture.createdCount, 71);
  assert.strictEqual(resCapture.skippedCount, 1);
  const captureDoc = docs['subjects/math_capture'];
  assert.strictEqual(captureDoc._data.name, 'mathématiques', 'Capture subject must not be renamed');
  assert.strictEqual(captureDoc._data.code, undefined, 'Capture subject must not automatically get code');

  // -------------------------------------------------------------
  // CONFLITS
  // -------------------------------------------------------------
  
  // 40. même code avec autre section refusé
  resetDb();
  setDocState('users', 'op_director', true, { role: 'director', isActive: true, schoolId: 'S1' });
  setDocState('subjects', 'custom_conflicting_code', true, {
    id: 'custom_conflicting_code',
    schoolId: 'S1',
    code: 'FR-MAT-MATH',
    name: 'Éveil mathématique',
    section: 'anglophone', // anglophone instead of francophone
    cycles: ['nursery'],
    category: 'Mathématiques',
    isActive: true
  });
  await assertThrowsBusinessError(
    () => seedDefaultSubjectCatalog({ schoolId: 'S1' }, { auth: { uid: 'op_director' } }),
    'failed-precondition',
    'SUBJECT_SEED_CONFLICT'
  );

  console.log("Les tests mockés démontrent les branches métier et les écritures préparées. Ils ne démontrent pas le retry ni la concurrence réelle du SDK Firestore.");
  console.log('✅ All Seed Subject Catalog Cloud Functions Tests PASSED successfully!');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
