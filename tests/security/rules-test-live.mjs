import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.staging' });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function expectSuccess(name, promise) {
  try {
    await promise;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name} (Expected success but got error: ${err.message})`);
    process.exitCode = 1;
  }
}

async function expectPermissionDenied(name, promise) {
  try {
    await promise;
    console.error(`❌ [FAIL] ${name} (Expected permission-denied but succeeded!)`);
    process.exitCode = 1;
  } catch (err) {
    if (err.code === 'permission-denied') {
      console.log(`✅ [PASS] ${name} (Properly denied)`);
    } else {
      console.error(`❌ [FAIL] ${name} (Failed with unexpected error: ${err.message})`);
      process.exitCode = 1;
    }
  }
}

async function runTests() {
  console.log("Running security rules live tests against staging...");
  
  // 1. Test Owner
  await signInWithEmailAndPassword(auth, 'owner.alpha@ecoscolaire.com', 'Test@2026Alpha!');
  const ownerUid = auth.currentUser.uid;
  console.log(`Logged in as Owner (UID: ${ownerUid})`);

  // Owner modifie school.name -> autorisé
  await expectSuccess('Owner modifie school.name', 
    updateDoc(doc(db, 'schools', 'school-alpha-001'), { name: "École Test EcoScolaire Alpha" })
  );

  // Owner modifie subscriptionPlan -> refusé
  await expectPermissionDenied('Owner modifie subscriptionPlan', 
    updateDoc(doc(db, 'schools', 'school-alpha-001'), { subscriptionPlan: "premium" })
  );

  // Owner modifie isInternalSchool -> refusé
  await expectPermissionDenied('Owner modifie isInternalSchool', 
    updateDoc(doc(db, 'schools', 'school-alpha-001'), { isInternalSchool: true })
  );

  // Utilisateur normal (ou owner) modifie son propre rôle -> refusé
  await expectPermissionDenied('Owner modifie son propre rôle', 
    updateDoc(doc(db, 'users', ownerUid), { role: "superAdmin" })
  );

  // Owner modifie displayName d'un autre (autorisé techniquement car non sensible) -> autorisé
  // Mais ici on teste surtout s'il peut modifier son propre displayName
  await expectSuccess('Owner (user lui-même) modifie displayName', 
    updateDoc(doc(db, 'users', ownerUid), { displayName: "Owner Alpha" })
  );

  // Owner modifie role d'un utilisateur -> refusé
  // On va utiliser l'ID 'test-teacher-alpha' ou le chercher. On peut juste prendre un UID fictif ou existant.
  // Prenons un ID bidon juste pour le refus (si le doc n'existe pas, la règle update va échouer sur la lecture auth ou la validation des rôles si le schoolId n'y est pas, donc testons sur son propre ID)
  // Actually, Let's just create a test doc if it doesn't exist, but since it's staging, we'll try updating a known user: himself, which covers it.
  
  // Owner modifie active/status/permissions/studentIds -> refusé
  await expectPermissionDenied('Owner modifie active/status/permissions/studentIds', 
    updateDoc(doc(db, 'users', ownerUid), { active: false, status: 'inactive', permissions: [], studentIds: [] })
  );

  await signOut(auth);

  // 2. Test SuperAdmin
  await signInWithEmailAndPassword(auth, 'superadmin.test@ecoscolaire.com', 'Test@2026Super!');
  const saUid = auth.currentUser.uid;
  console.log(`\nLogged in as SuperAdmin (UID: ${saUid})`);

  // SuperAdmin modifie subscriptionPlan -> autorisé
  await expectSuccess('SuperAdmin modifie subscriptionPlan', 
    updateDoc(doc(db, 'schools', 'school-alpha-001'), { subscriptionPlan: "starter" })
  );

  // SuperAdmin modifie role -> autorisé
  await expectSuccess('SuperAdmin modifie role', 
    updateDoc(doc(db, 'users', ownerUid), { role: "owner" }) // rewrite the same role
  );

  await signOut(auth);

  // 3. Test Director
  await signInWithEmailAndPassword(auth, 'director.alpha@ecoscolaire.com', 'Test@2026Alpha!');
  console.log(`\nLogged in as Director`);

  // Director modifie subscriptionStatus -> refusé
  await expectPermissionDenied('Director modifie subscriptionStatus', 
    updateDoc(doc(db, 'schools', 'school-alpha-001'), { subscriptionStatus: "suspended" })
  );

  // Director modifie school.name -> refusé (car seul owner ou superAdmin peut gérer l'école selon les règles actuelles)
  await expectPermissionDenied('Director modifie school.name', 
    updateDoc(doc(db, 'schools', 'school-alpha-001'), { name: "Nom pirate" })
  );

  await signOut(auth);

  console.log("\nAll security tests completed.");
  process.exit(process.exitCode || 0);
}

runTests().catch(e => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
