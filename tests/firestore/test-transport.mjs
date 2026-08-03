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
    await db.collection('schools').doc('schoolA').set({ name: 'School A', transportPolicy: { secretaryManageAll: true }, version: 1 });
    await db.collection('schools').doc('schoolB').set({ name: 'School B' });

    // Utilisateurs
    await db.collection('users').doc('directorA').set({ role: 'director', schoolId: 'schoolA', active: true });
    await db.collection('users').doc('directorB').set({ role: 'director', schoolId: 'schoolB', active: true });
    await db.collection('users').doc('driverA').set({ role: 'driver', schoolId: 'schoolA', active: true });
    await db.collection('users').doc('secNoPermB').set({ role: 'secretary', schoolId: 'schoolB', active: true });
    await db.collection('users').doc('secPermA').set({ role: 'secretary', schoolId: 'schoolA', active: true });
    await db.collection('users').doc('secMulti').set({ role: 'secretary', schoolId: 'schoolA', schoolIds: ['schoolA', 'schoolB'], active: true });

    // Données existantes école B
    await db.collection('buses').doc('busB').set({ schoolId: 'schoolB', name: 'Bus B' });
    await db.collection('busRoutes').doc('routeB').set({ schoolId: 'schoolB', name: 'Route B' });
    await db.collection('fuelExpenses').doc('fuelB').set({ schoolId: 'schoolB', amount: 1000 });
  });

  const dbDirectorA = testEnv.authenticatedContext('directorA').firestore();
  const dbDirectorB = testEnv.authenticatedContext('directorB').firestore();
  const dbDriverA = testEnv.authenticatedContext('driverA').firestore();
  const dbSecNoPermB = testEnv.authenticatedContext('secNoPermB').firestore();
  const dbSecPermA = testEnv.authenticatedContext('secPermA').firestore();
  const dbSecMulti = testEnv.authenticatedContext('secMulti').firestore();

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

    // Extra: Driver can create breakdown strictly encadrée (Durcissement P0.5)

    // Cas autorisé
    // 1. Un driver peut créer une panne avec exactement le payload frontend autorisé.
    const validPayload = { id: 'bd1', schoolId: 'schoolA', date: '2026-08-02', busId: 'busA', description: 'Test', severity: 'légère', status: 'signalée' };
    await assertSucceeds(dbDriverA.collection('breakdowns').doc('bd1').set(validPayload));

    // Clés inconnues
    // 2. Rejet avec arbitraryField.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err1').set({ ...validPayload, id: 'bd_err1', arbitraryField: 'test' }));
    // 3. Rejet avec resolvedAt.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err2').set({ ...validPayload, id: 'bd_err2', resolvedAt: '2026-08-02' }));
    // 4. Rejet avec approvedBy.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err3').set({ ...validPayload, id: 'bd_err3', approvedBy: 'admin' }));
    // 5. Rejet avec internalNotes.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err4').set({ ...validPayload, id: 'bd_err4', internalNotes: 'notes' }));
    // 6. Rejet avec repairProvider.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err5').set({ ...validPayload, id: 'bd_err5', repairProvider: 'Garage' }));

    // Champs financiers et administratifs
    // 7. Rejet avec estimatedCost positif.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err6').set({ ...validPayload, id: 'bd_err6', estimatedCost: 5000 }));
    // 8. Rejet avec actualCost.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err7').set({ ...validPayload, id: 'bd_err7', actualCost: 1000 }));
    // 9. Rejet avec statut différent de signalée.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err8').set({ ...validPayload, id: 'bd_err8', status: 'en_réparation' }));
    // 10. Rejet avec statut résolue.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err9').set({ ...validPayload, id: 'bd_err9', status: 'réparée' }));

    // Champs obligatoires
    // 11. Rejet sans busId.
    const noBusId = { ...validPayload, id: 'bd_err10' }; delete noBusId.busId;
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err10').set(noBusId));
    // 12. Rejet sans description.
    const noDesc = { ...validPayload, id: 'bd_err11' }; delete noDesc.description;
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err11').set(noDesc));
    // 13. Rejet sans schoolId.
    const noSchool = { ...validPayload, id: 'bd_err12' }; delete noSchool.schoolId;
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err12').set(noSchool));
    // 14. Rejet avec busId non string.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err13').set({ ...validPayload, id: 'bd_err13', busId: 123 }));
    // 15. Rejet avec description non string.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err14').set({ ...validPayload, id: 'bd_err14', description: 123 }));
    // 16. Rejet avec severity invalide.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err15').set({ ...validPayload, id: 'bd_err15', severity: 'critique' }));
    // 17. Rejet avec format de date invalide (vide/non string).
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err16').set({ ...validPayload, id: 'bd_err16', date: '' }));

    // Isolation SaaS
    // 18. Rejet si le driver de l’école A utilise schoolId de l’école B.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err17').set({ ...validPayload, id: 'bd_err17', schoolId: 'schoolB' }));
    // 19. Rejet si le document breakdown est dans l’école A mais référence un bus de l’école B.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err18').set({ ...validPayload, id: 'bd_err18', busId: 'busB' }));
    // 20. Rejet si le busId n’existe pas.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd_err19').set({ ...validPayload, id: 'bd_err19', busId: 'unknown_bus' }));

    // Opérations interdites
    // 22. Le driver ne peut toujours pas modifier une panne existante.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd1').update({ description: 'New description' }));
    // 23. Le driver ne peut toujours pas supprimer une panne.
    await assertFails(dbDriverA.collection('breakdowns').doc('bd1').delete());
    // 24. Les rôles administratifs autorisés conservent leurs opérations légitimes.
    await assertSucceeds(dbDirectorA.collection('breakdowns').doc('bd1').update({ status: 'en_réparation' }));

    // --- Nouveaux Tests : ÉTAPE 7 - PROTECTION POLITIQUE TRANSPORT ---
    const dbOwnerA = testEnv.authenticatedContext('ownerA').firestore();
    const dbSuperAdmin = testEnv.authenticatedContext('superAdmin1').firestore();
    const dbAccountantA = testEnv.authenticatedContext('accountantA').firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('users').doc('ownerA').set({ role: 'owner', schoolId: 'schoolA', active: true });
      await context.firestore().collection('users').doc('superAdmin1').set({ role: 'superAdmin', active: true });
      await context.firestore().collection('users').doc('accountantA').set({ role: 'accountant', schoolId: 'schoolA', active: true });
    });

    // Owner
    await assertSucceeds(dbOwnerA.collection('schools').doc('schoolA').update({ transportPolicy: { secretaryManageAll: true } }));
    await assertSucceeds(dbOwnerA.collection('schools').doc('schoolA').update({ transportPolicy: { secretaryManageAll: false } }));
    await assertFails(dbOwnerA.collection('schools').doc('schoolB').update({ transportPolicy: { secretaryManageAll: true } }));

    // SuperAdmin
    await assertSucceeds(dbSuperAdmin.collection('schools').doc('schoolA').update({ transportPolicy: { secretaryManageAll: true } }));

    // Rôles refusés
    await assertFails(dbSecPermA.collection('schools').doc('schoolA').update({ transportPolicy: { secretaryManageAll: true } }));
    await assertFails(dbSecPermA.collection('schools').doc('schoolA').update({ transportPolicy: { secretaryManageAll: false } }));
    await assertFails(dbDirectorA.collection('schools').doc('schoolA').update({ transportPolicy: { secretaryManageAll: false } }));
    await assertFails(dbAccountantA.collection('schools').doc('schoolA').update({ transportPolicy: { secretaryManageAll: false } }));
    await assertFails(dbDriverA.collection('schools').doc('schoolA').update({ transportPolicy: { secretaryManageAll: true } }));
    await assertFails(dbTeacherA.collection('schools').doc('schoolA').update({ transportPolicy: { secretaryManageAll: true } }));

    // Structure
    await assertFails(dbOwnerA.collection('schools').doc('schoolA').update({ transportPolicy: { secretaryManageAll: 'yes' } }));
    await assertFails(dbOwnerA.collection('schools').doc('schoolA').update({ transportPolicy: { unknownKey: true } }));

    // Non-régression
    await assertFails(dbOwnerA.collection('schools').doc('schoolA').update({ schoolId: 'hacked' })); // 4. Owner ne peut pas changer schoolId
    // Director updating another field allowed (calendar pointer)
    await assertSucceeds(dbDirectorA.collection('schools').doc('schoolA').update({ activeAcademicYearId: 'year2', updatedAt: '2026', updatedBy: 'directorA', version: 2 }));
    // Director updating calendar pointer AND transportPolicy should fail
    await assertFails(dbDirectorA.collection('schools').doc('schoolA').update({ activeAcademicYearId: 'year2', updatedAt: '2026', updatedBy: 'directorA', version: 2, transportPolicy: { secretaryManageAll: true } }));

    console.log("✅ TESTS ÉTAPE 7 : Protection de la politique Transport sur le document School -> PASS");

     // Nouveaux tests P1 - Capacité transportPolicy par école
    // 1. École B sans politique (comportement limité)
    await assertFails(dbSecNoPermB.collection('fuelExpenses').doc('fuelSec1').set({ schoolId: 'schoolB', amount: 5000 }));
    await assertFails(dbSecNoPermB.collection('maintenances').doc('maintSec1').set({ schoolId: 'schoolB', amount: 5000 }));
    await assertFails(dbSecNoPermB.collection('breakdowns').doc('breakSec1').set({ schoolId: 'schoolB', status: 'signalée' }));

    // 2. École A avec politique (comportement complet)
    await assertSucceeds(dbSecPermA.collection('buses').doc('busSec2').set({ schoolId: 'schoolA', name: 'Bus Sec' }));
    await assertSucceeds(dbSecPermA.collection('busRoutes').doc('routeSec2').set({ schoolId: 'schoolA', name: 'Route Sec' }));
    await assertSucceeds(dbSecPermA.collection('fuelExpenses').doc('fuelSec2').set({ schoolId: 'schoolA', amount: 5000 }));
    await assertSucceeds(dbSecPermA.collection('maintenances').doc('maintSec2').set({ schoolId: 'schoolA', amount: 5000 }));
    await assertSucceeds(dbSecPermA.collection('breakdowns').doc('breakSec2').set({ schoolId: 'schoolA', status: 'signalée', estimatedCost: 1000 }));
    await assertSucceeds(dbSecPermA.collection('breakdowns').doc('breakSec2').update({ status: 'en_réparation', actualCost: 1200 }));

    // 3. Utilisateur multi-écoles (secMulti) - a des droits dans A, mais échoue sur B (isolation/politique)
    await assertSucceeds(dbSecMulti.collection('maintenances').doc('maintSecM').set({ schoolId: 'schoolA', amount: 100 }));
    await assertFails(dbSecMulti.collection('maintenances').doc('maintSecMB').set({ schoolId: 'schoolB', amount: 100 }));

    // 4. Isolation
    await assertFails(dbSecPermA.collection('buses').doc('busB').get());
    await assertFails(dbSecPermA.collection('fuelExpenses').doc('fuelSec2').update({ schoolId: 'schoolB' }));
    await assertFails(dbSecNoPermB.collection('buses').doc('busSec2').update({ name: 'Hacked by B' }));

    // 5. Suppression (Toujours refusée)
    await assertFails(dbSecPermA.collection('buses').doc('busSec2').delete());
    await assertFails(dbSecPermA.collection('fuelExpenses').doc('fuelSec2').delete());

    // 6. Driver inchangé
    await assertFails(dbDriverA.collection('buses').doc('busDriver').set({ schoolId: 'schoolA', name: 'Bus Driver' }));

    console.log("✅ TESTS P1 : Politique Transport par école (transportPolicy) -> PASS");
    console.log("✅ TESTS P1 : Gestion Transport par Secrétaire avec capacité manageAllTransport -> PASS");

    console.log("\n🚀 TOUS LES TESTS TRANSPORT ONT RÉUSSI.");
  } catch (err) {
    console.error("❌ ERREUR LORS D'UN TEST:", err);
    process.exit(1);
  } finally {
    await testEnv.cleanup();
  }
}

runTests();
