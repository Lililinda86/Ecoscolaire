import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const red = '\x1b[31m';
const green = '\x1b[32m';
const reset = '\x1b[0m';

let failed = false;

function check(name, condition) {
  if (condition) {
    console.log(`${green}✅ ${name}${reset}`);
  } else {
    console.log(`${red}❌ ${name}${reset}`);
    failed = true;
  }
}

try {
  console.log("--- STATICAL VERIFICATION 3B.1 ---");
  
  const studentsPath = path.join(process.cwd(), 'src/pages/Students.tsx');
  const studentsContent = fs.readFileSync(studentsPath, 'utf8');

  // Verify Students.tsx hasn't implemented runTransaction or studentCount yet
  check('Students.tsx n\'implémente pas encore studentCount', !studentsContent.includes('studentCount'));
  check('Students.tsx n\'utilise pas encore runTransaction', !studentsContent.includes('runTransaction'));
  check('Students.tsx n\'a pas ajouté de saveDB (anti-pattern)', (studentsContent.match(/saveDB\(/g) || []).length <= 4);
  
  // Verify Diagnostic.tsx contains the reconciliation logic
  const diagnosticPath = path.join(process.cwd(), 'src/pages/Diagnostic.tsx');
  const diagnosticContent = fs.readFileSync(diagnosticPath, 'utf8');
  check('Diagnostic.tsx inclut la réconciliation de studentCount', diagnosticContent.includes('reconcileStudentCount'));
  check('Diagnostic.tsx modifie schools via updateDoc', diagnosticContent.includes('updateDoc(doc(firestoreDb, \'schools\''));
  check('Diagnostic.tsx vérifie le rôle superAdmin', diagnosticContent.includes('currentUser?.role !== \'superAdmin\'') && diagnosticContent.includes('currentUser?.role === \'superAdmin\''));
  
  // Verify firestore.rules
  const rulesPath = path.join(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  check('firestore.rules protège studentCount', rulesContent.includes('\'studentCount\'') && rulesContent.includes('isUpdatingSaasFields'));
  
  // Verify forbidden files were not modified
  const diffOutput = execSync('git diff --name-only HEAD').toString();
  const modifiedFiles = diffOutput.split('\n').filter(Boolean);
  
  const forbiddenFiles = [
    'src/pages/Students.tsx',
    'src/pages/Payments.tsx',
    'src/context/AppContext.tsx'
  ];
  
  let scopeViolated = false;
  for (const file of modifiedFiles) {
    const normalizedFile = file.replace(/\\/g, '/');
    if (forbiddenFiles.some(f => normalizedFile.includes(f))) {
      console.log(`${red}❌ VIOLATION DE SCOPE : ${normalizedFile} a été modifié !${reset}`);
      scopeViolated = true;
    }
  }
  check('Périmètre strictement respecté (Pas de flux core modifié)', !scopeViolated);

  if (failed) {
    process.exit(1);
  } else {
    console.log(`${green}✅ ALL TESTS PASSED${reset}`);
  }
} catch (err) {
  console.error("Erreur d'exécution du test:", err);
  process.exit(1);
}
