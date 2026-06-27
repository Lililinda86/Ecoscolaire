import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Usage: node scripts/migrate-student-counts.mjs <path-to-serviceAccountKey.json>

const serviceAccountPath = process.argv[2];

if (!serviceAccountPath) {
  console.error("ERREUR BLOCANTE : Authentification Firebase Admin requise.");
  console.error("Veuillez fournir le chemin vers le fichier JSON du compte de service.");
  console.error("Exemple: node scripts/migrate-student-counts.mjs ./serviceAccountKey.json");
  process.exit(1);
}

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`ERREUR : Le fichier ${serviceAccountPath} n'existe pas.`);
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  const db = admin.firestore();
  
  async function migrate() {
    console.log("Démarrage de la migration de studentCount...");
    const schoolsSnapshot = await db.collection('schools').get();
    let totalSchools = 0;
    let totalStudentsCounted = 0;
  
    for (const schoolDoc of schoolsSnapshot.docs) {
      const schoolId = schoolDoc.id;
      const schoolData = schoolDoc.data();
      
      console.log(`\nTraitement école : ${schoolData.name || schoolId}`);
      
      // Compter les élèves réels
      const studentsSnapshot = await db.collection('students').where('schoolId', '==', schoolId).get();
      const realCount = studentsSnapshot.size;
      
      console.log(`- Élèves réels trouvés : ${realCount}`);
      console.log(`- studentCount actuel : ${schoolData.studentCount !== undefined ? schoolData.studentCount : 'NON DÉFINI'}`);
      
      if (schoolData.studentCount !== realCount) {
        await db.collection('schools').doc(schoolId).update({
          studentCount: realCount
        });
        console.log(`✅ schoolId ${schoolId} mis à jour avec studentCount = ${realCount}`);
      } else {
        console.log(`⏭️ schoolId ${schoolId} déjà à jour.`);
      }
      
      totalSchools++;
      totalStudentsCounted += realCount;
    }
  
    console.log("\nMigration terminée avec succès.");
    console.log(`Écoles traitées : ${totalSchools}`);
    console.log(`Total élèves comptés : ${totalStudentsCounted}`);
  }
  
  migrate().catch(console.error).finally(() => process.exit(0));

} catch (err) {
  console.error("Erreur critique :", err);
  process.exit(1);
}
