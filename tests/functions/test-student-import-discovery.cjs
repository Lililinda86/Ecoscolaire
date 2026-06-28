const assert = require('assert');
const { runDiscovery } = require('../../functions/lib/studentImportDiscovery.js');

async function runTests() {
  console.log('=== DÉMARRAGE DES TESTS MOCKÉS PHASE 2B ===');
  let passed = 0;
  let failed = 0;

  async function testCase(name, fn) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${name} - ERROR: ${err.message}`);
      failed++;
    }
  }

  // Mock firestore db
  function createDbMock(existingIds, errorToThrow = null) {
    return {
      collection: (col) => ({
        doc: (id) => ({ id }) // return object with id
      }),
      getAll: async (...docRefs) => {
        if (errorToThrow) throw new Error(errorToThrow);
        return docRefs.map(ref => ({
          exists: existingIds.includes(ref.id)
        }));
      }
    };
  }

  const baseNormalized = {
    summary: { total: 0, valid: 0, invalid: 0, skipped: 0 },
    validRows: [],
    invalidRows: [],
    skippedRows: []
  };

  // 1. fichier sans doublon (tous nouveaux)
  await testCase('1. fichier sans doublon (tous nouveaux)', async () => {
    const db = createDbMock([]);
    const normalized = {
      ...baseNormalized,
      validRows: [
        { id: 'ID1', matricule: 'M1' },
        { id: 'ID2', matricule: 'M2' }
      ]
    };
    const res = await runDiscovery(db, normalized, 10, 100);
    assert.strictEqual(res.summary.newStudents, 2);
    assert.strictEqual(res.summary.updatedStudents, 0);
    assert.strictEqual(res.summary.skippedRows, 0);
    assert.strictEqual(res.quotaCheck.passed, true);
    assert.strictEqual(res.quotaCheck.futureCount, 12);
    assert.strictEqual(res.creates.length, 2);
    assert.strictEqual(res.updates.length, 0);
  });

  // 2. doublons internes
  await testCase('2. doublons internes', async () => {
    const db = createDbMock([]);
    const normalized = {
      ...baseNormalized,
      validRows: [
        { id: 'ID1', matricule: 'M1' },
        { id: 'ID1', matricule: 'M1' }, // duplicate
        { id: 'ID2', matricule: 'M2' }
      ]
    };
    const res = await runDiscovery(db, normalized, 10, 100);
    assert.strictEqual(res.summary.newStudents, 2);
    assert.strictEqual(res.summary.skippedRows, 1);
    assert.strictEqual(res.skippedRows[0].reason, 'DUPLICATE_IN_FILE');
    assert.strictEqual(res.creates.length, 2);
  });

  // 3. quota dépassé
  await testCase('3. quota dépassé', async () => {
    const db = createDbMock([]);
    const normalized = {
      ...baseNormalized,
      validRows: [
        { id: 'ID1', matricule: 'M1' },
        { id: 'ID2', matricule: 'M2' }
      ]
    };
    // limit is 10, current is 9. 9 + 2 = 11 > 10.
    const res = await runDiscovery(db, normalized, 9, 10);
    assert.strictEqual(res.quotaCheck.passed, false);
    assert.strictEqual(res.quotaCheck.futureCount, 11);
  });

  // 4. tous existants
  await testCase('4. tous existants', async () => {
    const db = createDbMock(['ID1', 'ID2']);
    const normalized = {
      ...baseNormalized,
      validRows: [
        { id: 'ID1', matricule: 'M1' },
        { id: 'ID2', matricule: 'M2' }
      ]
    };
    // limit is 10, current is 10. but 0 new students, so futureCount = 10 <= 10. Should pass.
    const res = await runDiscovery(db, normalized, 10, 10);
    assert.strictEqual(res.summary.newStudents, 0);
    assert.strictEqual(res.summary.updatedStudents, 2);
    assert.strictEqual(res.quotaCheck.passed, true);
    assert.strictEqual(res.creates.length, 0);
    assert.strictEqual(res.updates.length, 2);
  });

  // 5. mélange créations / mises à jour
  await testCase('5. mélange créations / mises à jour', async () => {
    const db = createDbMock(['ID_EXIST']);
    const normalized = {
      ...baseNormalized,
      validRows: [
        { id: 'ID_NEW', matricule: 'M1' },
        { id: 'ID_EXIST', matricule: 'M2' }
      ]
    };
    const res = await runDiscovery(db, normalized, 10, 100);
    assert.strictEqual(res.summary.newStudents, 1);
    assert.strictEqual(res.summary.updatedStudents, 1);
    assert.strictEqual(res.creates[0].id, 'ID_NEW');
    assert.strictEqual(res.updates[0].id, 'ID_EXIST');
  });

  // 6. erreur Firestore
  await testCase('6. erreur Firestore', async () => {
    const db = createDbMock([], 'DEADLINE_EXCEEDED');
    const normalized = {
      ...baseNormalized,
      validRows: [
        { id: 'ID1', matricule: 'M1' }
      ]
    };
    let threw = false;
    try {
      await runDiscovery(db, normalized, 10, 100);
    } catch (err) {
      assert.match(err.message, /DEADLINE_EXCEEDED/);
      threw = true;
    }
    assert.strictEqual(threw, true);
  });

  // 7. payload vide
  await testCase('7. payload vide', async () => {
    const db = createDbMock([]);
    const normalized = {
      ...baseNormalized,
      validRows: []
    };
    const res = await runDiscovery(db, normalized, 5, 10);
    assert.strictEqual(res.summary.newStudents, 0);
    assert.strictEqual(res.quotaCheck.passed, true);
    assert.strictEqual(res.quotaCheck.futureCount, 5);
  });

  console.log(`\n=== RÉSULTATS: ${passed} PASS, ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

runTests();
