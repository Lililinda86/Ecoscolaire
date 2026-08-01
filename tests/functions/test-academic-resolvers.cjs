const { test } = require('node:test');
const assert = require('node:assert');
const { resolveAcademicYear, resolveClassProgram } = require('../../functions/lib/academic/academicResolvers');
const admin = require('firebase-admin');

const docs = {};

function clearDb() {
  for (const key in docs) delete docs[key];
}

function setupDb() {
  return {
    collection: (path) => ({
      doc: (id) => {
        const key = `${path}/${id}`;
        if (!docs[key]) {
          docs[key] = {
            id,
            path: key,
            exists: false,
            _data: null,
            set: async function(data) {
              this.exists = true;
              this._data = { ...data };
            },
            mockGet: function() {
              return {
                id: this.id,
                exists: this.exists,
                data: () => this._data
              };
            }
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
              size: matches.length,
              docs: matches
            };
          }
        };
        return queryObj;
      }
    })
  };
}

test('Academic Resolvers Test Suite', async (t) => {
  const db = setupDb();
  let transaction;

  t.beforeEach(async () => {
    clearDb();
    // Wrap our test logic in a mock transaction to simulate the Firestore transaction environment
    transaction = {
      get: async (queryOrRef) => {
        return queryOrRef.mockGet();
      }
    };
  });

  await t.test('resolveAcademicYear: Canonical ID exists but belongs to another school', async () => {
    const yearRef = db.collection('academicYears').doc('ay_other-school_2026-2027_a1b2');
    await yearRef.set({ schoolId: 'other-school', name: '2026-2027' });

    await assert.rejects(
      async () => await resolveAcademicYear(transaction, db, 'my-school', 'ay_other-school_2026-2027_a1b2'),
      (err) => {
        assert.strictEqual(err.code, 'not-found');
        assert.strictEqual(err.details.businessCode, 'ACADEMIC_YEAR_NOT_FOUND');
        return true;
      }
    );
  });

  await t.test('resolveAcademicYear: Canonical ID exists but name is invalid', async () => {
    const yearRef = db.collection('academicYears').doc('ay_my-school_2026-2027_a1b2');
    await yearRef.set({ schoolId: 'my-school', name: '2026_2027' }); // Invalid format

    await assert.rejects(
      async () => await resolveAcademicYear(transaction, db, 'my-school', 'ay_my-school_2026-2027_a1b2'),
      (err) => {
        assert.strictEqual(err.code, 'failed-precondition');
        assert.strictEqual(err.details.businessCode, 'PROGRAM_INTEGRITY_ERROR');
        return true;
      }
    );
  });

  await t.test('resolveAcademicYear: ID missing but syntax valid falls back to legacy successfully', async () => {
    const yearRef = db.collection('academicYears').doc('legacy-id-123');
    await yearRef.set({ schoolId: 'my-school', name: '2026-2027' });

    const result = await resolveAcademicYear(transaction, db, 'my-school', '2026-2027');
    assert.strictEqual(result.id, 'legacy-id-123');
    assert.strictEqual(result.name, '2026-2027');
  });

  await t.test('resolveAcademicYear: Canonical ID read successfully', async () => {
    const yearRef = db.collection('academicYears').doc('ay_my-school_2026-2027_a1b2');
    await yearRef.set({ schoolId: 'my-school', name: '2026-2027' });

    const result = await resolveAcademicYear(transaction, db, 'my-school', 'ay_my-school_2026-2027_a1b2');
    assert.strictEqual(result.id, 'ay_my-school_2026-2027_a1b2');
    assert.strictEqual(result.name, '2026-2027');
  });

  await t.test('resolveClassProgram: Found via canonical field', async () => {
    const resolvedYear = { id: 'ay_123', name: '2026-2027', data: {} };
    await db.collection('classPrograms').doc('canonical-doc-123').set({
      schoolId: 'school-1', classId: 'class-1', academicYearId: 'ay_123'
    });

    const result = await resolveClassProgram(transaction, db, 'school-1', 'class-1', resolvedYear);
    assert.strictEqual(result.id, 'canonical-doc-123');
  });

  await t.test('resolveClassProgram: Found via legacy field', async () => {
    const resolvedYear = { id: 'ay_123', name: '2026-2027', data: {} };
    await db.collection('classPrograms').doc('legacy-doc-123').set({
      schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027'
    });

    const result = await resolveClassProgram(transaction, db, 'school-1', 'class-1', resolvedYear);
    assert.strictEqual(result.id, 'legacy-doc-123');
  });

  await t.test('resolveClassProgram: Found exclusively via deterministic document ID (empty fields case)', async () => {
    const resolvedYear = { id: 'ay_123', name: '2026-2027', data: {} };
    // The document lacks searchable fields but sits at the correct deterministic location
    await db.collection('classPrograms').doc('school-1__2026-2027__class-1').set({
      somethingElse: true
    });

    const result = await resolveClassProgram(transaction, db, 'school-1', 'class-1', resolvedYear);
    assert.strictEqual(result.id, 'school-1__2026-2027__class-1');
  });

  await t.test('resolveClassProgram: Canonical and Legacy are DISTINCT documents (throws error)', async () => {
    const resolvedYear = { id: 'ay_123', name: '2026-2027', data: {} };
    await db.collection('classPrograms').doc('doc-a').set({
      schoolId: 'school-1', classId: 'class-1', academicYearId: 'ay_123'
    });
    await db.collection('classPrograms').doc('doc-b').set({
      schoolId: 'school-1', classId: 'class-1', academicYearId: '2026-2027'
    });

    await assert.rejects(
      async () => await resolveClassProgram(transaction, db, 'school-1', 'class-1', resolvedYear),
      (err) => {
        assert.strictEqual(err.code, 'failed-precondition');
        assert.strictEqual(err.details.businessCode, 'PROGRAM_INTEGRITY_ERROR');
        return true;
      }
    );
  });

  await t.test('resolveClassProgram: Canonical query matches exactly deterministic doc (deduplication)', async () => {
    const resolvedYear = { id: 'ay_123', name: '2026-2027', data: {} };
    // This doc fulfills both the deterministic ID and canonical field query.
    await db.collection('classPrograms').doc('school-1__2026-2027__class-1').set({
      schoolId: 'school-1', classId: 'class-1', academicYearId: 'ay_123'
    });

    const result = await resolveClassProgram(transaction, db, 'school-1', 'class-1', resolvedYear);
    assert.strictEqual(result.id, 'school-1__2026-2027__class-1');
  });
});
