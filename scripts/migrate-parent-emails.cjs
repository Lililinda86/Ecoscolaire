const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where, doc, getDoc, updateDoc, writeBatch } = require('firebase/firestore');
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

const DRY_RUN = process.env.DRY_RUN !== 'false';

async function run() {
  try {
    console.log(`Starting migration (DRY_RUN=${DRY_RUN})...`);
    // NOTE: This uses client SDK, so we need rules access or superadmin
    await signInWithEmailAndPassword(auth, "superadmin.test@ecoscolaire.com", "Test@2026Super!");
    console.log("Logged in as SuperAdmin");

    const q = query(collection(db, 'users'), where('role', '==', 'parent'));
    const usersSnapshot = await getDocs(q);
    console.log(`Found ${usersSnapshot.size} parent users.`);

    let batch = writeBatch(db);
    let batchCount = 0;
    let updatedStudents = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const parentEmail = (userData.email || '').toLowerCase().trim();
      
      if (!parentEmail || !userData.studentIds || !Array.isArray(userData.studentIds)) {
        continue;
      }

      for (const studentId of userData.studentIds) {
        const studentRef = doc(db, 'students', studentId);
        const studentSnap = await getDoc(studentRef);
        
        if (studentSnap.exists()) {
          const studentData = studentSnap.data();
          const existingEmails = studentData.parentEmails || [];
          
          const normalizedExisting = existingEmails.map(e => e.toLowerCase().trim());
          if (!normalizedExisting.includes(parentEmail)) {
            const newEmails = [...existingEmails, parentEmail];
            if (!DRY_RUN) {
              batch.update(studentRef, { parentEmails: newEmails });
              batchCount++;
            }
            updatedStudents++;
            console.log(`[${DRY_RUN ? 'DRY-RUN' : 'LIVE'}] Linking student ${studentId} to parent ${parentEmail}`);
            
            if (batchCount >= 500) {
              await batch.commit();
              batch = writeBatch(db);
              batchCount = 0;
            }
          }
        } else {
          console.warn(`Student ${studentId} referenced by parent ${parentEmail} does not exist.`);
        }
      }
    }
    
    if (batchCount > 0 && !DRY_RUN) {
      await batch.commit();
    }

    console.log(`Migration completed. Students updated: ${updatedStudents}`);
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

run();
