import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';

let testEnv;

async function runTests() {
  const projectId = `ecoscolaire-test-${Date.now()}`;
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(path.resolve('firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080
    },
  });

  console.log("=== EXÉCUTION DES TESTS FIRESTORE EMULATOR ===");

  const dbAdmin = testEnv.unauthenticatedContext().firestore();
  
  // Setup School and User
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.collection('schools').doc('school123').set({ name: 'School 123' });
    await db.collection('users').doc('user123').set({
      role: 'director',
      schoolId: 'school123',
      active: true
    });
  });

  const db = testEnv.authenticatedContext('user123').firestore();

  const validJob = {
    id: 'job1',
    schoolId: 'school123',
    status: 'PENDING',
    storagePath: 'import_jobs_data/school123/my-file.json',
    totalRows: 100,
    processedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    createdBy: 'user123',
    createdAt: new Date()
  };

  try {
    // TEST 1 : Création valide
    await assertSucceeds(db.collection('student_import_jobs').doc('job1').set(validJob));
    console.log("✅ TEST 1 : Création valide -> PASS");

    // TEST 2 : Champ interdit (billingBypass)
    await assertFails(db.collection('student_import_jobs').doc('job2').set({
      ...validJob, id: 'job2', billingBypass: true
    }));
    console.log("✅ TEST 2 : Champ interdit (billingBypass) -> FAIL (OK)");

    // TEST 3 : Champ interdit (isAdmin)
    await assertFails(db.collection('student_import_jobs').doc('job3').set({
      ...validJob, id: 'job3', isAdmin: true
    }));
    console.log("✅ TEST 3 : Champ interdit (isAdmin) -> FAIL (OK)");

    // TEST 4 : status = SUCCESS
    await assertFails(db.collection('student_import_jobs').doc('job4').set({
      ...validJob, id: 'job4', status: 'SUCCESS'
    }));
    console.log("✅ TEST 4 : status = SUCCESS -> FAIL (OK)");

    // TEST 5 : processedCount = 10
    await assertFails(db.collection('student_import_jobs').doc('job5').set({
      ...validJob, id: 'job5', processedCount: 10
    }));
    console.log("✅ TEST 5 : processedCount = 10 -> FAIL (OK)");

    // TEST 6 : storagePath faux
    await assertFails(db.collection('student_import_jobs').doc('job6').set({
      ...validJob, id: 'job6', storagePath: 'import_jobs_data/school123/file.exe'
    }));
    console.log("✅ TEST 6 : storagePath faux (.exe) -> FAIL (OK)");

    await assertFails(db.collection('student_import_jobs').doc('job6b').set({
      ...validJob, id: 'job6b', storagePath: 'import_jobs_data/school999/file.json'
    }));
    console.log("✅ TEST 6b : storagePath faux (mauvais schoolId) -> FAIL (OK)");

    // TEST 7 : schoolId différent
    await assertFails(db.collection('student_import_jobs').doc('job7').set({
      ...validJob, id: 'job7', schoolId: 'school999'
    }));
    console.log("✅ TEST 7 : schoolId différent -> FAIL (OK)");

    // TEST 8 : update
    await assertFails(db.collection('student_import_jobs').doc('job1').update({
      status: 'RUNNING'
    }));
    console.log("✅ TEST 8 : update -> FAIL (OK)");

    // TEST 9 : delete
    await assertFails(db.collection('student_import_jobs').doc('job1').delete());
    console.log("✅ TEST 9 : delete -> FAIL (OK)");

    // TEST 10 : lecture école différente
    const otherDb = testEnv.authenticatedContext('user999').firestore(); // User of another school
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('users').doc('user999').set({
        role: 'director',
        schoolId: 'school999',
        active: true
      });
    });
    
    await assertFails(otherDb.collection('student_import_jobs').doc('job1').get());
    console.log("✅ TEST 10 : lecture école différente -> FAIL (OK)");

    console.log("\n🚀 TOUS LES TESTS EMULATOR ONT RÉUSSI.");
  } catch (err) {
    console.error("❌ ERREUR LORS D'UN TEST:", err);
    process.exit(1);
  } finally {
    await testEnv.cleanup();
  }
}

runTests();
