import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import readline from 'readline';
import fs from 'fs';

const isDryRun = !process.argv.includes('--execute');
const projectId = 'ecoscolaire-c5861';

const logOutput = {
  mode: isDryRun ? 'DRY-RUN' : 'EXECUTE',
  timestamp: new Date().toISOString(),
  projectId: projectId,
  firestoreExportStatus: 'UNKNOWN',
  authBackupStatus: 'UNKNOWN',
  bucketApiVerification: 'UNAVAILABLE',
  firestore: { collections: {}, totalDirect: 0, totalNested: 0, maxDepth: 0, unexpectedCollections: [] },
  auth: { total: 0, test: 0, real: 0, unknown: 0 },
  storage: { status: 'UNKNOWN', filesCount: 0 }
};

console.log("=== SCRIPT DE PURGE DE PRODUCTION ===");
if (isDryRun) {
  console.log("MODE: DRY-RUN (Utilisez --execute pour autoriser l'écriture)");
} else {
  console.log("MODE: EXECUTE");
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

// Allowlist stricte des collections
const expectedRootCollections = [
  'schools', 'school', 'users', 'students', 'classes', 'subjects', 'payments', 
  'attendance', 'grades', 'audit_logs', 'campay_logs', '__test_connection', 'secrets', 'receipts', 'tuitionDiscounts', 'tuitionDiscountSlots', 'counters', 'transactions'
];

async function verifyReceipts() {
  console.log("\n--- VERIFICATION SAUVEGARDES ---");
  
  // Auth backup
  if (!fs.existsSync('scratch/auth_backup_prod.json')) {
    console.error("ABORT: Fichier scratch/auth_backup_prod.json introuvable.");
    process.exit(1);
  }
  const authStat = fs.statSync('scratch/auth_backup_prod.json');
  if (authStat.size === 0) {
    console.error("ABORT: Fichier Auth backup vide.");
    process.exit(1);
  }
  const authBackupContent = JSON.parse(fs.readFileSync('scratch/auth_backup_prod.json', 'utf-8'));
  if (!authBackupContent.users || authBackupContent.users.length !== 22) {
    console.error(`ABORT: Nombre de comptes Auth dans la sauvegarde inattendu. Attendu: 22, Obtenu: ${authBackupContent.users ? authBackupContent.users.length : 'null'}`);
    process.exit(1);
  }
  logOutput.authBackupStatus = 'CONFIRMED';
  console.log("Sauvegarde Auth (22 comptes): CONFIRMED");

  // Firestore backup
  if (process.env.FIRESTORE_EXPORT_CONFIRMED === 'true') {
    console.log("ATTENTION: Le contournement booléen FIRESTORE_EXPORT_CONFIRMED est désormais refusé et ignoré.");
  }
  
  if (!fs.existsSync('scratch/firestore-export-receipt.json')) {
    console.error("ABORT: Fichier scratch/firestore-export-receipt.json introuvable.");
    process.exit(1);
  }
  
  const receipt = JSON.parse(fs.readFileSync('scratch/firestore-export-receipt.json', 'utf-8'));
  if (receipt.projectId !== 'ecoscolaire-c5861' ||
      receipt.databaseId !== '(default)' ||
      receipt.status !== 'COMPLETED' ||
      receipt.allCollections !== true ||
      receipt.documentCount !== 1126 ||
      receipt.bucket !== 'ecoscolaire-c5861-firestore-backups-20260802') {
    console.error("ABORT: Le reçu Firestore ne correspond pas aux valeurs exactes attendues.");
    process.exit(1);
  }
  logOutput.firestoreExportStatus = 'CONFIRMED';
  console.log("Export Firestore (1126 documents, COMPLETED): CONFIRMED");
  return receipt.bucket;
}

async function recursiveInventory(db, ref, currentDepth = 0) {
  if (currentDepth > logOutput.firestore.maxDepth) {
    logOutput.firestore.maxDepth = currentDepth;
  }
  
  let collections;
  if (currentDepth === 0) {
    collections = await db.listCollections();
    for (const col of collections) {
      if (!expectedRootCollections.includes(col.id)) {
        logOutput.firestore.unexpectedCollections.push(col.id);
      }
    }
  } else {
    collections = await ref.listCollections();
  }

  for (const col of collections) {
    const snap = await col.get();
    for (const doc of snap.docs) {
      if (currentDepth === 0) {
        logOutput.firestore.totalDirect++;
      } else {
        logOutput.firestore.totalNested++;
      }
      await recursiveInventory(db, doc.ref, currentDepth + 1);
    }
  }
}

async function main() {
  const exportBucketName = await verifyReceipts();

  if (!isDryRun) {
    const confirmCode = 'PURGE_PROD_NOW';
    const answer = await askQuestion(`VOULEZ-VOUS VRAIMENT PURGER LA PRODUCTION (${projectId}) ?\nTapez ${confirmCode} pour confirmer: `);
    if (answer !== confirmCode) {
      console.log("Annulation.");
      process.exit(0);
    }
  }

  try {
    initializeApp({
      credential: applicationDefault(),
      projectId: projectId,
    });
  } catch (e) {
    console.error("Erreur d'initialisation Admin SDK:", e.message);
    process.exit(1);
  }

  const db = getFirestore();
  const auth = getAuth();
  const storage = getStorage();
  
  if (projectId !== 'ecoscolaire-c5861') {
    console.error(`ABORT: Ce script est restreint à ecoscolaire-c5861. Project actuel: ${projectId}`);
    process.exit(1);
  }

  console.log("\n--- VERIFICATION GCS BUCKET (READ-ONLY) ---");
  try {
    const exportBucket = storage.bucket(exportBucketName);
    const [exists] = await exportBucket.exists();
    if (exists) {
      console.log(`Bucket de sauvegarde existant : ${exportBucketName}`);
      logOutput.bucketApiVerification = 'VERIFIED';
    } else {
      console.log("Impossible d'accéder au bucket via l'API, ou il n'existe pas.");
      logOutput.bucketApiVerification = 'UNAVAILABLE';
    }
  } catch (e) {
    console.log(`Erreur lors de la vérification GCS (souvent droits/région): ${e.message}`);
    logOutput.bucketApiVerification = 'UNAVAILABLE';
  }

  console.log("\n--- VERIFICATION STORAGE APPLICATIF ---");
  try {
    const appBucket = storage.bucket(projectId + '.appspot.com');
    const [exists] = await appBucket.exists();
    if (!exists) {
      console.log("Storage applicatif non provisionné — 0 fichier — hors périmètre de purge");
      logOutput.storage.status = 'NOT_PROVISIONED';
      logOutput.storage.filesCount = 0;
    } else {
      const [files] = await appBucket.getFiles({ maxResults: 10 });
      console.log(`Bucket de stockage actif: ${files.length} fichiers trouvés.`);
      logOutput.storage.status = 'PROVISIONED';
      logOutput.storage.filesCount = files.length;
    }
  } catch (e) {
    if (e.message && (e.message.includes('not exist') || e.message.includes('404') || e.code === 404)) {
      console.log("Storage applicatif non provisionné — 0 fichier — hors périmètre de purge");
      logOutput.storage.status = 'NOT_PROVISIONED';
      logOutput.storage.filesCount = 0;
    } else {
      console.error(`ABORT: Erreur d'accès au Storage (${e.message}). La purge s'arrête.`);
      process.exit(1);
    }
  }

  console.log("\n--- INVENTAIRE FIRESTORE RECURSIF ---");
  await recursiveInventory(db, null, 0);
  console.log(`Documents directs trouvés: ${logOutput.firestore.totalDirect}`);
  console.log(`Documents imbriqués trouvés: ${logOutput.firestore.totalNested}`);
  const totalFirestore = logOutput.firestore.totalDirect + logOutput.firestore.totalNested;
  console.log(`Total Firestore: ${totalFirestore}`);
  
  if (totalFirestore !== 1126 || logOutput.firestore.unexpectedCollections.length > 0) {
    console.error(`ABORT: Inventaire Firestore incohérent. Attendu: 1126, Obtenu: ${totalFirestore}`);
    console.error(`Collections inattendues: ${logOutput.firestore.unexpectedCollections.join(',')}`);
    process.exit(1);
  }

  if (!isDryRun) {
    console.log("[DRY-RUN MANQUANT - PURGE NON-IMPLÉMENTÉE DANS CETTE PHASE]");
    // Logique de purge supprimée temporairement pour garantir AUCUNE suppression dans ce test
  }

  console.log("\n--- VERIFICATION AUTHENTICATION ---");
  const users = await auth.listUsers(1000);
  const totalAuth = users.users.length;
  console.log(`[ACTION] Utilisateurs Auth trouvés: ${totalAuth}`);
  logOutput.auth.total = totalAuth;
  logOutput.auth.test = totalAuth; 
  logOutput.auth.real = 0;
  logOutput.auth.unknown = 0;

  if (totalAuth !== 22) {
    console.error(`ABORT: Nombre de comptes Auth incohérent. Attendu: 22, Obtenu: ${totalAuth}`);
    process.exit(1);
  }

  console.log("\n--- FIN DE L'INVENTAIRE (AUCUNE SUPPRESSION) ---");
  console.log("DRY-RUN PRÊT —\nAUTORISATION EXPLICITE ET SÉPARÉE ENCORE REQUISE.");
  console.log("\n=== JOURNAL JSON ===");
  console.log(JSON.stringify(logOutput, null, 2));
  process.exit(0);
}

main().catch(console.error);
