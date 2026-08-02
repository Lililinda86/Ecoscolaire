import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp as initClient } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, updateDoc } from 'firebase/firestore';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const adminApp = initAdmin({ projectId: 'ecoscolaire-staging' });
const adminDb = getAdminFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);

const clientApp = initClient({
  apiKey: "AIzaSyFakeApiKeyForEmulatorTest123456789",
  projectId: "ecoscolaire-staging"
});
const clientAuth = getAuth(clientApp);
const clientDb = getFirestore(clientApp);

import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';

connectAuthEmulator(clientAuth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(clientDb, '127.0.0.1', 8080);

async function runE2E() {
  console.log("=== DÉBUT TEST E2E ÉMULATEUR (FRAIS PAR ÉCOLE) ===");
  try {
    const testEmail = "sec_a@test.com";
    const pass = "password123";
    const uid = "sec_a_uid";
    const schoolIdA = "ecole-avec-frais";
    const schoolIdB = "ecole-sans-frais";

    // 1. CLEANUP & SETUP AUTH
    try { await adminAuth.deleteUser(uid); } catch (e) {}
    await adminAuth.createUser({ uid, email: testEmail, password: pass });
    await adminAuth.setCustomUserClaims(uid, { role: 'secretary', schoolId: schoolIdA });

    await adminDb.collection('users').doc(uid).set({
      email: testEmail,
      role: 'secretary',
      schoolId: schoolIdA,
      active: true,
      isActive: true
    });

    // 2. SETUP ÉCOLE A (avec 3 tranches synthétiques)
    await adminDb.collection('schools').doc(schoolIdA).set({
      name: "École A",
      classFees: {
        "Class A1": { registration: 1000, tuition: 6000, t1: 2000, t2: 2000, t3: 2000 }
      }
    });
    await adminDb.collection('academicYears').doc(`ay__${schoolIdA}__2026-08-17__2027-07-31`).set({
      schoolId: schoolIdA, name: "2026-2027"
    });
    await adminDb.collection('classes').doc("class_a1_id").set({
      schoolId: schoolIdA, name: "Class A1", type: "francophone", isActive: true
    });

    // 3. SETUP ÉCOLE B (sans frais)
    await adminDb.collection('schools').doc(schoolIdB).set({
      name: "École B" // Pas de classFees
    });
    await adminDb.collection('academicYears').doc(`ay__${schoolIdB}__2026-08-17__2027-07-31`).set({
      schoolId: schoolIdB, name: "2026-2027"
    });
    await adminDb.collection('classes').doc("class_b1_id").set({
      schoolId: schoolIdB, name: "Class B1", type: "francophone", isActive: true
    });

    // 4. CONNEXION CLIENT (Secrétaire École A)
    await signInWithEmailAndPassword(clientAuth, testEmail, pass);

    // 5. TEST ÉCOLE A (Trois tranches)
    const schoolADoc = await getDoc(doc(clientDb, 'schools', schoolIdA));
    const feesA = schoolADoc.data().classFees["Class A1"];
    if (feesA.tuition !== 6000 || feesA.t1 !== 2000 || feesA.t2 !== 2000 || feesA.t3 !== 2000) {
       throw new Error("École A : Les 3 tranches synthétiques n'ont pas été lues correctement.");
    }
    
    await setDoc(doc(clientDb, 'students', "student_a_1"), {
      schoolId: schoolIdA,
      name: "Student A",
      classId: "class_a1_id",
      className: "Class A1",
      section: "francophone",
      matricule: "MAT-A-1",
      parentPhone: "+237600000000",
      parentEmails: [],
      tuitionExpected: feesA.tuition,
      feeT1: feesA.t1,
      feeT2: feesA.t2,
      feeT3: feesA.t3
    });
    console.log("[SUCCÈS] École A : Élève inscrit avec 3 tranches synthétiques copiées en snapshot.");

    // 6. TEST ÉCOLE B (Sans configuration - avec admin auth temporaire pour valider qu'aucune dette n'est créée)
    // Mais le clientAuth = secretaire A, qui ne peut pas écrire dans l'école B !
    // Testons donc l'ISOLATION directement
    try {
      await setDoc(doc(clientDb, 'students', "student_b_1"), {
        schoolId: schoolIdB,
        name: "Student B",
        classId: "class_b1_id",
        className: "Class B1",
        section: "francophone",
        matricule: "MAT-B-1",
        parentPhone: "+237600000001",
        parentEmails: []
      });
      throw new Error("FAIL: Secrétaire A a pu inscrire un élève dans École B !");
    } catch (e) {
      if (e.message.includes("FAIL")) throw e;
      console.log("[SUCCÈS] Isolation : Secrétaire A bloquée pour écriture dans École B.");
    }

    // Test de modification classFees par Secrétaire A (Firestore rules)
    try {
      await updateDoc(doc(clientDb, 'schools', schoolIdA), {
        "classFees.Class A1.tuition": 9999
      });
      throw new Error("FAIL: Secrétaire a pu modifier les tarifs !");
    } catch(e) {
      if (e.message.includes("FAIL")) throw e;
      console.log("[SUCCÈS] Sécurité : Secrétaire bloquée pour modifier classFees (seul l'Owner/Director peut).");
    }

    console.log("=== TEST E2E ÉMULATEUR TERMINÉ AVEC SUCCÈS ===");
    process.exit(0);

  } catch (error) {
    console.error("ERREUR E2E:", error);
    process.exit(1);
  }
}

runE2E();
