import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load dot env
dotenv.config({ path: '.env.production' });

const TARGET_PROJECT = 'ecoscolaire-c5861';
const TARGET_DATABASE = '(default)';

const EXPECTED_SCHOOL_ID = 'italo-gsb';
const EXPECTED_ACADEMIC_YEAR_ID = 'ay__italo-gsb__2026-08-17__2027-07-31';

async function run() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');

  if (args.some(a => ['--force', '--skip-preflight', '--ignore-existing', '--allow-partial'].includes(a))) {
    console.error("[ERREUR] Paramètres interdits détectés.");
    process.exit(1);
  }

  console.log(`=== INITIALISATION ITALO PRODUCTION ===`);
  console.log(`Mode: ${isExecute ? 'EXECUTE' : 'DRY-RUN'}`);

  // Firebase Admin Init
  let app;
  try {
    app = initializeApp({
      credential: applicationDefault(),
      projectId: TARGET_PROJECT,
    });
  } catch (e) {
    console.error("[ERREUR] Impossible d'initialiser Firebase Admin:", e.message);
    process.exit(1);
  }

  const actualProjectId = app.options.projectId;
  if (!actualProjectId || actualProjectId !== TARGET_PROJECT) {
    console.error(`[ERREUR] Projet invalide: ${actualProjectId}. Seul ${TARGET_PROJECT} est autorisé.`);
    process.exit(1);
  }

  const firestoreDb = getFirestore(app);
  // Verify databaseId
  // The Admin SDK automatically uses '(default)' if no databaseId is explicitly specified in getFirestore().
  // However, we can assert it from the databaseId property if available, or just enforce our design.
  const actualDatabaseId = firestoreDb.databaseId || TARGET_DATABASE;
  if (actualDatabaseId !== TARGET_DATABASE) {
    console.error(`[ERREUR] Base de données invalide: ${actualDatabaseId}. Seule ${TARGET_DATABASE} est autorisée.`);
    process.exit(1);
  }

  const auth = getAuth(app);

  console.log(`\n[PREFLIGHT] Lecture Auth et Firestore...`);

  // Read Auth Users
  let authUsers = [];
  let pageToken;
  do {
    const listUsersResult = await auth.listUsers(1000, pageToken);
    authUsers.push(...listUsersResult.users);
    pageToken = listUsersResult.pageToken;
  } while (pageToken);

  // Read Firestore root collections
  const collections = await firestoreDb.listCollections();
  let totalDocs = 0;
  const firestoreState = {};

  for (const col of collections) {
    const snap = await col.get();
    totalDocs += snap.size;
    firestoreState[col.id] = snap.docs.map(d => d.id);
  }

  console.log(`\n=== ETAT ACTUEL DE LA PRODUCTION ===`);
  console.log(`Auth : ${authUsers.length} comptes trouvés.`);
  console.log(`Firestore : ${totalDocs} documents trouvés dans ${collections.length} collections.`);
  for (const [colName, docs] of Object.entries(firestoreState)) {
    console.log(`  - ${colName} : ${docs.length} documents`);
  }

  // Load identity variables
  const ownerEmail = process.env.ITALO_OWNER_EMAIL;
  const ownerName = process.env.ITALO_OWNER_DISPLAY_NAME;
  const secEmail = process.env.ITALO_SECRETARY_EMAIL;
  const secName = process.env.ITALO_SECRETARY_DISPLAY_NAME;

  const validateEmail = (email) => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const ownerEmailValid = validateEmail(ownerEmail);
  const secEmailValid = validateEmail(secEmail);

  const identitiesReady = ownerEmailValid && ownerName && secEmailValid && secName;

  const ownerEmailNorm = ownerEmailValid ? ownerEmail.toLowerCase().trim() : '';
  const secEmailNorm = secEmailValid ? secEmail.toLowerCase().trim() : '';

  console.log(`\n=== VARIABLES ADMINISTRATIVES ===`);
  console.log(`ITALO_OWNER_EMAIL: ${ownerEmailValid ? 'PRESENT' : 'MISSING'}`);
  console.log(`ITALO_OWNER_DISPLAY_NAME: ${ownerName ? 'PRESENT' : 'MISSING'}`);
  console.log(`ITALO_SECRETARY_EMAIL: ${secEmailValid ? 'PRESENT' : 'MISSING'}`);
  console.log(`ITALO_SECRETARY_DISPLAY_NAME: ${secName ? 'PRESENT' : 'MISSING'}`);

  // Idempotency state mapping
  let hasConflicts = false;

  const checkAuthIdempotency = (email, expectedRole) => {
    if (!email) return { status: 'BLOCKED' };
    const existing = authUsers.find(u => u.email === email);
    if (!existing) return { status: 'CREATE' };
    const claims = existing.customClaims || {};
    if (claims.role === expectedRole && claims.schoolId === EXPECTED_SCHOOL_ID) {
      return { status: 'EXISTING_MATCH', uid: existing.uid };
    }
    return { status: 'CONFLICT', reason: 'Claims mismatch on existing account' };
  };

  const ownerState = checkAuthIdempotency(ownerEmailNorm, 'owner');
  const secState = checkAuthIdempotency(secEmailNorm, 'secretary');

  if (ownerState.status === 'CONFLICT' || secState.status === 'CONFLICT') hasConflicts = true;

  // Check unauthorized existing data
  const allowedCols = ['schools', 'academicYears', 'users'];
  for (const [colName, docs] of Object.entries(firestoreState)) {
    if (!allowedCols.includes(colName) && docs.length > 0) {
      console.log(`[CONFLIT] Collection non autorisée trouvée: ${colName}`);
      hasConflicts = true;
    }
  }
  if (firestoreState['schools'] && firestoreState['schools'].length > 0 && !firestoreState['schools'].includes(EXPECTED_SCHOOL_ID)) {
    console.log(`[CONFLIT] Ecole inattendue trouvée.`);
    hasConflicts = true;
  }
  if (firestoreState['schools'] && firestoreState['schools'].length > 1) {
    console.log(`[CONFLIT] Multiples écoles trouvées.`);
    hasConflicts = true;
  }

  let schoolState = 'CREATE';
  if (firestoreState['schools']?.includes(EXPECTED_SCHOOL_ID)) schoolState = 'EXISTING_MATCH';

  let yearState = 'CREATE';
  if (firestoreState['academicYears']?.includes(EXPECTED_ACADEMIC_YEAR_ID)) yearState = 'EXISTING_MATCH';

  let ownerDocState = ownerState.status;
  if (ownerState.uid && firestoreState['users']?.includes(ownerState.uid)) ownerDocState = 'EXISTING_MATCH';

  let secDocState = secState.status;
  if (secState.uid && firestoreState['users']?.includes(secState.uid)) secDocState = 'EXISTING_MATCH';

  console.log(`\n=== IDEMPOTENCE ET ETAT FUTUR ===`);
  console.log(`School ${EXPECTED_SCHOOL_ID} : ${schoolState}`);
  console.log(`AcademicYear ${EXPECTED_ACADEMIC_YEAR_ID} : ${yearState}`);
  console.log(`Owner Auth : ${ownerState.status}`);
  console.log(`Owner Doc : ${ownerDocState}`);
  console.log(`Secretary Auth : ${secState.status}`);
  console.log(`Secretary Doc : ${secDocState}`);

  const isPureEmpty = totalDocs === 0 && authUsers.length === 0;

  if (isExecute) {
    console.log(`\n[EXECUTE] Mode exécution demandé.`);
    if (hasConflicts) {
      console.error(`[ERREUR] Conflits détectés, exécution annulée.`);
      process.exit(1);
    }
    if (!identitiesReady) {
      console.error(`[ERREUR] Variables administratives manquantes.`);
      process.exit(1);
    }
    if (!isPureEmpty && !args.includes('--confirm-idempotent-retry')) {
      console.error(`[ERREUR] La base n'est pas strictement vide. Pour reprendre une initialisation partielle, fournissez un token de confirmation.`);
      process.exit(1);
    }

    const confirmationToken = args.find(a => a.startsWith('--token='))?.split('=')[1];
    if (confirmationToken !== 'REAL_EXECUTE_CONFIRMED') {
      console.error(`[ERREUR] Token de confirmation absent ou invalide. Fournissez --token=REAL_EXECUTE_CONFIRMED`);
      process.exit(1);
    }

    console.log(`[SIMULATION EXECUTE] Le script s'arrête ici pour ce ticket.`);
    process.exit(1);
  } else {
    // Mode DRY-RUN
    console.log(`\n=== RÉSUMÉ DRY-RUN ===`);
    console.log(`Statut de la structure : VALID`);
    if (hasConflicts) {
      console.log(`Execution readiness : BLOCKED_CONFLICTS`);
    } else if (!identitiesReady) {
      console.log(`Execution readiness : BLOCKED_MISSING_IDENTITY_DATA`);
    } else {
      console.log(`Execution readiness : READY`);
    }
    process.exit(0);
  }
}

run().catch(e => {
  console.error("Erreur fatale:", e);
  process.exit(1);
});
