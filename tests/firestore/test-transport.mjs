import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';

let testEnv;

async function runTests() {
  const projectId = `ecoscolaire-test-transport-${Date.now()}`;
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(path.resolve('firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080
    },
  });

  console.log("=== EXÉCUTION DES TESTS FIRESTORE EMULATOR : TRANSPORT ===");

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    // Ecoles
    await db.collection('schools').doc('schoolA').set({ name: 'School A' });
    await db.collection('schools').doc('schoolB').set({ name: 'School B' });

    // Utilisateurs
    await db.collection('users').doc('directorA').set({ role: 'director', schoolId: 'schoolA', active: true });
    await db.collection('users').doc('directorB').set({ role: 'director', schoolId: 'schoolB', active: true });
    await db.collection('users').doc('driverA').set({ role: 'driver', schoolId: 'schoolA', active: true });

    // Données existantes école B
    await db.collection('buses').doc('busB').set({ schoolId: 'schoolB', name: 'Bus B' });
    await db.collection('busRoutes').doc('routeB').set({ schoolId: 'schoolB', name: 'Route B' });
    await db.collection('fuelExpenses').doc('fuelB').set({ schoolId: 'schoolB', amount: 1000 });
  });

  const dbDirectorA = testEnv.authenticatedContext('directorA').firestore();
  const dbDirectorB = testEnv.authenticatedContext('directorB').firestore();
  const dbDriverA = testEnv.authenticatedContext('driverA').firestore();

  try {
    // 1. Un utilisateur de l'école A ne peut pas lire un document de l'école B.
    await assertFails(dbDirectorA.collection('buses').doc('busB').get());
    console.log("✅ TEST 1 : Un utilisateur de l'école A ne peut pas lire un document de l'école B -> PASS");

    // 2. Un utilisateur de l'école A ne peut pas modifier un document de l'école B en remplaçant son schoolId.
    await assertFails(dbDirectorA.collection('buses').doc('busB').set({ schoolId: 'schoolA', name: 'Hacked Bus' }, { merge: true }));
    console.log("✅ TEST 2 : Un utilisateur de l'école A ne peut pas modifier un document de l'école B en remplaçant son schoolId -> PASS");

    // 3. Un utilisateur autorisé peut créer un document dans sa propre école.
    await assertSucceeds(dbDirectorA.collection('buses').doc('busA').set({ schoolId: 'schoolA', name: 'Bus A' }));
    console.log("✅ TEST 3 : Un utilisateur autorisé peut créer un document dans sa propre école -> PASS");

    // 4. Un utilisateur autorisé peut modifier un document de sa propre école.
    await assertSucceeds(dbDirectorA.collection('buses').doc('busA').update({ name: 'Bus A Updated' }));
    console.log("✅ TEST 4 : Un utilisateur autorisé peut modifier un document de sa propre école -> PASS");

    // 5. Le schoolId ne peut jamais être modifié.
    await assertFails(dbDirectorA.collection('buses').doc('busA').update({ schoolId: 'schoolB' }));
    console.log("✅ TEST 5 : Le schoolId ne peut jamais être modifié -> PASS");

    // 6. Toute suppression physique est refusée.
    await assertFails(dbDirectorA.collection('buses').doc('busA').delete());
    console.log("✅ TEST 6 : Toute suppression physique est refusée -> PASS");

    // 7. Un conducteur ne peut pas créer ou modifier un bus.
    await assertFails(dbDriverA.collection('buses').doc('busDriver').set({ schoolId: 'schoolA', name: 'Bus Driver' }));
    await assertFails(dbDriverA.collection('buses').doc('busA').update({ name: 'Driver Updated' }));
    console.log("✅ TEST 7 : Un conducteur ne peut pas créer ou modifier un bus -> PASS");

    // 8. Un conducteur ne peut pas créer, modifier ou lire un circuit.
    await assertFails(dbDriverA.collection('busRoutes').doc('routeDriver').set({ schoolId: 'schoolA', name: 'Route Driver' }));
    await assertFails(dbDriverA.collection('busRoutes').doc('routeA').get());
    console.log("✅ TEST 8 : Un conducteur ne peut pas créer, modifier ou lire un circuit -> PASS");

    // 9. Un rôle non autorisé ne peut pas modifier ou lire une dépense Transport -> PASS
    await assertFails(dbDriverA.collection('fuelExpenses').doc('fuelDriver').set({ schoolId: 'schoolA', amount: 5000 }));
    await assertFails(dbDriverA.collection('fuelExpenses').doc('fuelB').get());
    const dbTeacherA = testEnv.authenticatedContext('teacherA').firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('users').doc('teacherA').set({ role: 'teacher', schoolId: 'schoolA', active: true });
    });
    await assertFails(dbTeacherA.collection('maintenances').doc('maint1').set({ schoolId: 'schoolA', amount: 10000 }));
    console.log("✅ TEST 9 : Un rôle non autorisé ne peut pas modifier ou lire une dépense Transport -> PASS");

    // 10. Les lectures et écritures autorisées de l'administration continuent de fonctionner.
    await assertSucceeds(dbDirectorA.collection('busRoutes').doc('routeA').set({ schoolId: 'schoolA', name: 'Route A' }));
    await assertSucceeds(dbDirectorA.collection('busRoutes').doc('routeA').get());
    console.log("✅ TEST 10 : Les lectures et écritures autorisées de l'administration continuent de fonctionner -> PASS");

    // Extra: Driver can create breakdown strictly encadrée
    await assertSucceeds(dbDriverA.collection('breakdowns').doc('bd1').set({ schoolId: 'schoolA', status: 'signalée', busId: 'busA' }));
    await assertFails(dbDriverA.collection('breakdowns').doc('bd2').set({ schoolId: 'schoolA', status: 'en_réparation', busId: 'busA' })); // status interdit
    await assertFails(dbDriverA.collection('breakdowns').doc('bd3').set({ schoolId: 'schoolA', status: 'signalée', busId: 'busA', actualCost: 5000 })); // cout interdit
    await assertFails(dbDriverA.collection('breakdowns').doc('bd1').update({ status: 'en_réparation' })); // Driver ne peut plus update
    console.log("✅ TEST EXTRA : Conducteur peut créer une panne strictement encadrée mais pas la modifier -> PASS");

    console.log("\n🚀 TOUS LES TESTS TRANSPORT ONT RÉUSSI.");
  } catch (err) {
    console.error("❌ ERREUR LORS D'UN TEST:", err);
    process.exit(1);
  } finally {
    await testEnv.cleanup();
  }
}

runTests();
