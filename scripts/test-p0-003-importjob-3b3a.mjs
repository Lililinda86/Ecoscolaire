import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const FIRESTORE_RULES_PATH = path.join(ROOT_DIR, 'firestore.rules');
const STORAGE_RULES_PATH = path.join(ROOT_DIR, 'storage.rules');
const TYPES_PATH = path.join(ROOT_DIR, 'src', 'types', 'index.ts');

function checkFile(filePath, conditions) {
  if (!fs.existsSync(filePath)) {
    console.error(`[KO] Fichier introuvable: ${filePath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const condition of conditions) {
    if (!condition.regex.test(content)) {
      console.error(`[KO] Condition non remplie dans ${path.basename(filePath)} : ${condition.message}`);
      process.exit(1);
    } else {
      console.log(`[OK] ${path.basename(filePath)} : ${condition.message}`);
    }
  }
}

console.log("=== VÉRIFICATION DES RÈGLES FIRESTORE ===");
checkFile(FIRESTORE_RULES_PATH, [
  { regex: /match \/student_import_jobs\/\{jobId\}/, message: "Présence de match /student_import_jobs/{jobId}" },
  { regex: /allow create: if [\s\S]*request\.resource\.data\.status == 'PENDING'/, message: "Create limité au statut PENDING" },
  { regex: /allow update, delete: if false;/, message: "Update et Delete interdits pour le client sur import_jobs" },
]);

console.log("\n=== VÉRIFICATION DES RÈGLES STORAGE ===");
checkFile(STORAGE_RULES_PATH, [
  { regex: /match \/import_jobs_data\/\{schoolId\}\/\{jobId\}\.json/, message: "Présence de match /import_jobs_data/{schoolId}/{jobId}.json" },
  { regex: /allow create: if [\s\S]*request\.resource\.contentType == 'application\/json'/, message: "Create limité aux fichiers JSON" },
  { regex: /allow update: if false;/, message: "Update interdit (empêche overwrite par le client)" },
]);

console.log("\n=== VÉRIFICATION DES TYPES TYPESCRIPT ===");
checkFile(TYPES_PATH, [
  { regex: /export type StudentImportJobStatus = 'PENDING' \| 'VALIDATING' \| 'RUNNING' \| 'SUCCESS' \| 'PARTIAL_SUCCESS' \| 'FAILED' \| 'CANCELED';/, message: "Présence de StudentImportJobStatus" },
  { regex: /export interface StudentImportJobSummary \{/, message: "Présence de StudentImportJobSummary" },
  { regex: /export interface StudentImportJob \{/, message: "Présence de StudentImportJob" },
]);

console.log("\n✅ TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS.");
process.exit(0);
