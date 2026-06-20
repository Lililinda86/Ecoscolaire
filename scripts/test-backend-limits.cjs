const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, updateDoc } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const dotenv = require('dotenv');

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
const db = getFirestore(app);
const auth = getAuth(app);

async function testBackendLimits() {
  console.log("--- TEST BACKEND SaaS LIMITS ---");
  
  // Login as a normal owner/director to test rules
  try {
    await signInWithEmailAndPassword(auth, "kyrialove@gmail.com", "Test@2026Super!");
    // Note: kyrialove@gmail.com is superAdmin in some environments, we might need a regular owner.
    // Let's use a known test owner or superAdmin since we want to test studentsCount rules.
    // Wait, superAdmin bypasses canManagePedagogy but does superAdmin bypass canCreateStudentWithinLimits?
    // Let's check rules: allow create: if isAuthenticated() && isActive() && canManagePedagogy(...) && canCreateStudentWithinLimits(...);
    // Even superAdmin is bound by canCreateStudentWithinLimits!
  } catch (err) {
    console.log("Login failed", err.message);
    process.exit(1);
  }

  const testCases = [
    { schoolId: 'school-test-starter-199', expected: 'success' },
    { schoolId: 'school-test-starter-200', expected: 'denied' },
    { schoolId: 'school-test-pilot', expected: 'denied' },
    { schoolId: 'school-test-standard', expected: 'denied' },
    { schoolId: 'school-test-premium', expected: 'success' },
    { schoolId: 'school-test-internal-italo', expected: 'success' }
  ];

  let passed = 0;

  for (const tc of testCases) {
    console.log(`\nTesting creation for school: ${tc.schoolId} (Expected: ${tc.expected})`);
    try {
      const studentId = `test-student-${Date.now()}`;
      await setDoc(doc(db, 'students', studentId), {
        id: studentId,
        schoolId: tc.schoolId,
        name: 'Backend Test Student',
        matricule: 'B-TEST',
        createdAt: new Date().toISOString()
      });
      
      if (tc.expected === 'success') {
        console.log(`✅ Success as expected for ${tc.schoolId}`);
        passed++;
      } else {
        console.error(`❌ FAILED! Expected 'denied' but creation succeeded for ${tc.schoolId}`);
      }
    } catch (err) {
      if (err.code === 'permission-denied' && tc.expected === 'denied') {
        console.log(`✅ Denied as expected for ${tc.schoolId}`);
        passed++;
      } else {
        console.error(`❌ FAILED! Expected '${tc.expected}' but got error:`, err.message);
      }
    }
  }

  console.log(`\nTesting modification of studentsCount by client...`);
  try {
    // Attempt to modify studentsCount
    await updateDoc(doc(db, 'schools', 'school-test-starter-199'), {
      studentsCount: 10
    });
    console.error(`❌ FAILED! Client was able to modify studentsCount!`);
  } catch (err) {
    if (err.code === 'permission-denied') {
      console.log(`✅ Denied as expected (clients cannot modify SaaS fields).`);
      passed++;
    } else {
      console.error(`❌ FAILED! Unexpected error:`, err.message);
    }
  }

  console.log(`\n--- RESULTS ---`);
  console.log(`${passed} / ${testCases.length + 1} tests passed.`);
  
  if (passed === testCases.length + 1) {
    console.log("✅ ALL BACKEND LIMITS TESTS PASSED.");
    process.exit(0);
  } else {
    console.error("❌ SOME TESTS FAILED.");
    process.exit(1);
  }
}

testBackendLimits();
