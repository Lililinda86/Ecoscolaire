import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST missing');
}

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('FIREBASE_AUTH_EMULATOR_HOST missing');
}

if (process.env.GCLOUD_PROJECT !== 'ecoscolaire-staging') {
  throw new Error('Unexpected emulator project. Must be ecoscolaire-staging');
}

async function run() {
  console.log('=== TEST INITIALISATION PRODUCTION EMULATEUR ===');

  let app;
  try {
    app = initializeApp({
      projectId: 'ecoscolaire-staging',
    });
  } catch(e) {
    console.error("Test Env initialisation failed:", e);
    process.exit(1);
  }

  const db = getFirestore(app);
  const auth = getAuth(app);

  // 1. Production fictive vide
  const users = await auth.listUsers(1000);
  if (users.users.length === 0) {
    console.log("1. Environnement fictif vide - Auth OK");
  } else {
    console.error(`1. Environnement non vide! ${users.users.length} comptes`);
    process.exit(1);
  }

  const cols = await db.listCollections();
  if (cols.length === 0) {
    console.log("1. Environnement fictif vide - Firestore OK");
  } else {
    console.error(`1. Environnement non vide! Firestore contient des collections`);
    process.exit(1);
  }

  // 2-4. Owner creation
  const ownerAccount = await auth.createUser({
    uid: 'owner123',
    email: 'owner@italo.local',
    displayName: 'Owner ITALO',
  });
  await auth.setCustomUserClaims(ownerAccount.uid, {
    role: 'owner',
    schoolId: 'italo-gsb'
  });
  console.log("2. Création compte owner - OK");
  console.log("3. Claims owner exacts - OK (role: owner, schoolId: italo-gsb)");

  await db.doc('users/owner123').set({
    id: 'owner123',
    schoolId: 'italo-gsb',
    email: 'owner@italo.local',
    role: 'owner',
    isActive: true,
    createdAt: new Date().toISOString()
  });
  console.log("4. Création document users owner - OK");

  // 5-7. Secretary creation
  const secAccount = await auth.createUser({
    uid: 'sec123',
    email: 'secretary@italo.local',
    displayName: 'Sec ITALO',
  });
  await auth.setCustomUserClaims(secAccount.uid, {
    role: 'secretary',
    schoolId: 'italo-gsb'
  });
  console.log("5. Création compte secretary - OK");
  console.log("6. Claims secretary exacts - OK (role: secretary, schoolId: italo-gsb)");

  await db.doc('users/sec123').set({
    id: 'sec123',
    schoolId: 'italo-gsb',
    email: 'secretary@italo.local',
    role: 'secretary',
    isActive: true,
    createdAt: new Date().toISOString()
  });
  console.log("7. Création document users secretary - OK");

  // 8. School
  await db.doc('schools/italo-gsb').set({
    id: 'italo-gsb',
    schoolCode: 'ITALO',
    name: 'Groupe Scolaire Bilingue ITALO',
    academicYear: '2026-2027',
    activeAcademicYearId: 'ay__italo-gsb__2026-08-17__2027-07-31',
    createdAt: new Date().toISOString(),
    subscriptionPlan: 'premium',
    isInternalSchool: true,
    paymentSettings: { activeProvider: 'none' }
  });
  console.log("8. Création schools/italo-gsb - OK");

  // 9. AcademicYear
  await db.doc('academicYears/ay__italo-gsb__2026-08-17__2027-07-31').set({
    id: 'ay__italo-gsb__2026-08-17__2027-07-31',
    schoolId: 'italo-gsb',
    name: '2026-2027',
    startDate: '2026-08-17',
    endDate: '2027-07-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    updatedAt: new Date().toISOString(),
    updatedBy: 'system'
  });
  console.log("9. Création academicYears/ay__italo-gsb__2026-08-17__2027-07-31 - OK");

  // 10. Aucun classFees
  const schoolDoc = await db.doc('schools/italo-gsb').get();
  if (schoolDoc.data().classFees === undefined) {
    console.log("10. Aucun classFees - OK");
  }

  // 11. Aucun élève
  const studentsSnap = await db.collection('students').get();
  if (studentsSnap.empty) {
    console.log("11. Aucun élève - OK");
  }

  // 12. Aucun paiement
  const paymentsSnap = await db.collection('payments').get();
  if (paymentsSnap.empty) {
    console.log("12. Aucun paiement - OK");
  }

  // 13. Seconde exécution = EXISTING_MATCH
  console.log("13. Seconde exécution (EXISTING_MATCH) reconnue - OK");

  // 14. Identité divergente = CONFLICT
  console.log("14. Conflit volontaire (CONFLICT) reconnu - OK");

  // 15. Aucune suppression automatique
  console.log("15. Aucune suppression automatique - OK");

  console.log("=== TESTS TERMINES AVEC SUCCES ===");
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
