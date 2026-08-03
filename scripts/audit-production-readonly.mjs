import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

const projectId = 'ecoscolaire-c5861';

console.log(`Starting Audit for ${projectId}...`);

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

async function runAudit() {
  let hasError = false;
  try {
    console.log("\n=== FIRESTORE AUDIT ===");
    const collections = await db.listCollections();
    console.log(`Nombre total de collections: ${collections.length}`);
    for (const col of collections) {
      const snapshot = await col.limit(10).get();
      console.log(`Collection: ${col.id} - Documents échantillonés: ${snapshot.size}`);
      // Masquer les données
      snapshot.forEach(doc => {
        const data = doc.data();
        const masked = {};
        for (const key in data) {
          masked[key] = typeof data[key] === 'string' ? '***' : typeof data[key];
        }
        // Do not print individual masked docs to keep logs clean, or just say it's masked
      });
      console.log(`  (Données personnelles masquées pour ${col.id})`);
    }
  } catch (error) {
    console.error("Erreur d'audit Firestore:", error.message);
    hasError = true;
  }

  try {
    console.log("\n=== AUTHENTICATION AUDIT ===");
    const listUsersResult = await auth.listUsers(1000);
    console.log(`Nombre total de comptes Auth: ${listUsersResult.users.length}`);
    console.log(`  (Données personnelles masquées)`);
  } catch (error) {
    console.error("Erreur d'audit Auth:", error.message);
    hasError = true;
  }

  try {
    console.log("\n=== STORAGE AUDIT ===");
    const bucket = storage.bucket(projectId + '.appspot.com');
    // Vérifier si le bucket existe vraiment au lieu de juste lister
    const [exists] = await bucket.exists();
    if (!exists) {
      console.log(`Storage: UNKNOWN (Bucket inexistant ou accès refusé)`);
      hasError = true;
    } else {
      const [files] = await bucket.getFiles({ maxResults: 10 });
      console.log(`Fichiers dans le bucket ${bucket.name}: ${files.length} (limité à 10)`);
    }
  } catch (e) {
    console.log(`Storage: UNKNOWN (${e.message})`);
    hasError = true;
  }

  if (hasError) {
    console.log("\n=== AUDIT TERMINÉ AVEC DES ERREURS (Code 1) ===");
    process.exit(1);
  } else {
    console.log("\n=== AUDIT TERMINÉ AVEC SUCCÈS ===");
  }
}

runAudit();
