const assert = require('assert');
const { generateStudentId, normalizeRows } = require('../../functions/lib/studentImportNormalizer.js');

function runTests() {
  console.log('=== DÉMARRAGE DES TESTS MOCKÉS PHASE 2A ===');
  let passed = 0;
  let failed = 0;

  function testCase(name, fn) {
    try {
      fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${name} - ERROR: ${err.message}`);
      failed++;
    }
  }

  const schoolId = 'SCHOOL123';
  const jobId = 'JOB_ABC';
  const ts = '2026-01-01T00:00:00.000Z';

  // 1. même matricule + même école = même ID ;
  testCase('1. même matricule + même école = même ID', () => {
    const id1 = generateStudentId('S1', 'MAT1');
    const id2 = generateStudentId('S1', 'MAT1');
    assert.strictEqual(id1, id2);
  });

  // 2. même matricule + école différente = ID différent ;
  testCase('2. même matricule + école différente = ID différent', () => {
    const id1 = generateStudentId('S1', 'MAT1');
    const id2 = generateStudentId('S2', 'MAT1');
    assert.notStrictEqual(id1, id2);
  });

  // 3. matricule absent = invalid ;
  testCase('3. matricule absent = invalid', () => {
    const payload = [{ name: 'Alice', classId: 'C1' }];
    const res = normalizeRows(payload, schoolId, jobId, ts);
    assert.strictEqual(res.summary.invalid, 1);
    assert.strictEqual(res.invalidRows[0].errorCode, 'MISSING_MATRICULE');
  });

  // 4. champ dangereux `isAdmin` ignoré ;
  // 5. champ dangereux `billingBypass` ignoré ;
  testCase('4 & 5. champs dangereux ignorés', () => {
    const payload = [{ matricule: 'M1', name: 'Alice', classId: 'C1', isAdmin: true, billingBypass: true }];
    const res = normalizeRows(payload, schoolId, jobId, ts);
    assert.strictEqual(res.summary.valid, 1);
    const row = res.validRows[0];
    assert.strictEqual(row.isAdmin, undefined);
    assert.strictEqual(row.billingBypass, undefined);
  });

  // 6. montants financiers normalisés ;
  testCase('6. montants financiers normalisés', () => {
    const payload = [{ 
      matricule: 'M1', name: 'Alice', classId: 'C1', 
      feeT1: '1000', 
      feeT2: 250.5, 
      feeT3: 'abc',
      feeTransport: 'Infinity', // Infinity texte
      feeUniforms: null 
    }, {
      matricule: 'M2', name: 'Bob', classId: 'C1',
      feeT1: Infinity, // Infinity natif
      feeT2: -Infinity,
      feeT3: NaN,
      feeTransport: '',
      feeUniforms: undefined
    }];
    const res = normalizeRows(payload, schoolId, jobId, ts);
    const row1 = res.validRows[0];
    const row2 = res.validRows[1];
    
    // row1
    assert.strictEqual(row1.feeT1, 1000);
    assert.strictEqual(row1.feeT2, 250.5);
    assert.strictEqual(row1.feeT3, 0); // fallback to 0 for NaN
    assert.strictEqual(row1.feeTransport, 0); // "Infinity" -> Infinity -> 0
    assert.strictEqual(row1.feeUniforms, 0);

    // row2
    assert.strictEqual(row2.feeT1, 0);
    assert.strictEqual(row2.feeT2, 0);
    assert.strictEqual(row2.feeT3, 0);
    assert.strictEqual(row2.feeTransport, 0);
    assert.strictEqual(row2.feeUniforms, 0);
  });

  // 7. email parent normalisé ;
  testCase('7. email parent normalisé', () => {
    const payload = [{ 
      matricule: 'M1', name: 'Alice', classId: 'C1', 
      parentEmails: [' ALICE@MAIL.COM ', 'invalid-email', 'bob@test.com'] 
    }];
    const res = normalizeRows(payload, schoolId, jobId, ts);
    const row = res.validRows[0];
    assert.deepStrictEqual(row.parentEmails, ['alice@mail.com', 'bob@test.com']);
  });

  // 8. téléphone normalisé ;
  testCase('8. téléphone normalisé', () => {
    const payload = [
      { matricule: 'M1', name: 'A', classId: 'C1', parentPhone: ' +237 6.12 34 56-78 ' },
      { matricule: 'M2', name: 'B', classId: 'C1', parentPhone: '+237++699abc' },
      { matricule: 'M3', name: 'C', classId: 'C1', parentPhone: '00237699112233' }
    ];
    const res = normalizeRows(payload, schoolId, jobId, ts);
    assert.strictEqual(res.validRows[0].parentPhone, '+237612345678');
    assert.strictEqual(res.validRows[1].parentPhone, '+237699');
    assert.strictEqual(res.validRows[2].parentPhone, '00237699112233');
  });

  // 9. ligne vide = skipped ;
  testCase('9. ligne vide = skipped', () => {
    const payload = [{}];
    const res = normalizeRows(payload, schoolId, jobId, ts);
    assert.strictEqual(res.summary.skipped, 1);
  });

  // 10. ligne valide complète = valid ;
  testCase('10. ligne valide complète = valid', () => {
    const payload = [{ matricule: 'M1', name: 'Alice', classId: 'C1', gender: 'F' }];
    const res = normalizeRows(payload, schoolId, jobId, ts);
    assert.strictEqual(res.summary.valid, 1);
    assert.strictEqual(res.summary.invalid, 0);
  });

  // 11. normalisation Unicode / casse / espaces ;
  testCase('11. normalisation Unicode / casse / espaces', () => {
    const payload = [{ matricule: ' é M 1 ', name: ' ë l ï c ë ', classId: 'C1' }];
    const res = normalizeRows(payload, schoolId, jobId, ts);
    const row = res.validRows[0];
    assert.strictEqual(row.matricule, 'E M 1');
    assert.strictEqual(row.name, 'E L I C E');
  });

  // 12. aucune clé non whitelistée dans le résultat
  testCase('12. aucune clé non whitelistée dans le résultat', () => {
    const payload = [{ matricule: 'M1', name: 'Bob', classId: 'C1', randomKey: 'hello', anotherKey: 123 }];
    const res = normalizeRows(payload, schoolId, jobId, ts);
    const row = res.validRows[0];
    const keys = Object.keys(row);
    assert.strictEqual(keys.includes('randomKey'), false);
    assert.strictEqual(keys.includes('anotherKey'), false);
    assert.strictEqual(keys.length, 13); // id, schoolId, importJobId, importedAt, updatedAt, matricule, name, classId, feeT1, feeT2, feeT3, feeTransport, feeUniforms
  });

  console.log(`\n=== RÉSULTATS: ${passed} PASS, ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

runTests();
