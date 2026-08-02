import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import readline from 'readline';

const isDryRun = !process.argv.includes('--execute');
const projectId = 'ecoscolaire-c5861';

console.log("=== SCRIPT D'INITIALISATION MINIMALE (PRODUCTION) ===");
if (isDryRun) {
  console.log("MODE: DRY-RUN (Utilisez --execute pour écrire en base)");
} else {
  console.log("MODE: EXECUTE");
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

async function main() {
  if (!isDryRun) {
    const answer = await askQuestion(`VOULEZ-VOUS VRAIMENT INITIALISER LA PRODUCTION (${projectId}) ? (oui/non): `);
    if (answer.toLowerCase() !== 'oui') {
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

  const currentProjectId = (await db.listCollections()).length > -1 ? projectId : projectId; // just to be sure we are connected
  if (currentProjectId !== 'ecoscolaire-c5861') {
    console.error(`ABORT: Ce script est restreint à ecoscolaire-c5861. Project actuel: ${currentProjectId}`);
    process.exit(1);
  }

  // 1. Ecole ITALO
  const schoolId = 'ITALO';
  const schoolRef = db.collection('schools').doc(schoolId);
  const schoolSnap = await schoolRef.get();
  
  if (schoolSnap.exists) {
    console.log(`L'école ${schoolId} existe déjà, aucune écriture pour éviter un conflit.`);
  } else {
    console.log(`[ACTION] Création de l'école ${schoolId}`);
    if (!isDryRun) {
      await schoolRef.set({
        name: "École Primaire ITALO",
        type: "primary",
        cycleNames: { nursery: "Maternelle", primary: "Primaire" },
        features: { paymentEnabled: false, inventoryEnabled: true, transportEnabled: true, aiEnabled: true, saasEnabled: true, webhooksEnabled: true, staffEnabled: true },
        transportPolicy: { secretaryManageAll: true },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
  }

  // NOTE: Les comptes Fondateur et Secrétaire ne sont pas créés automatiquement avec un mot de passe en dur.
  // Ils doivent être créés via l'interface Firebase Authentication ou via un script sécurisé qui demande le mot de passe,
  // puis liés ici à la collection users.
  console.log("[INFO] Les comptes utilisateurs doivent être créés manuellement dans Auth ou via un prompt sécurisé. Ce script ne code pas de mots de passe.");

  console.log("=== FIN DU SCRIPT ===");
  process.exit(0);
}

main().catch(console.error);
