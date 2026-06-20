const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where, doc, updateDoc, writeBatch } = require('firebase/firestore');
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

async function run() {
  try {
    await signInWithEmailAndPassword(auth, "superadmin.test@ecoscolaire.com", "Test@2026Super!");
    console.log("Logged in as SuperAdmin");

    const schoolsSnapshot = await getDocs(collection(db, 'schools'));
    console.log(`Found ${schoolsSnapshot.size} schools.`);

    const results = [];
    
    // Process in batches
    let batch = writeBatch(db);
    let batchCount = 0;
    
    for (const schoolDoc of schoolsSnapshot.docs) {
      const schoolId = schoolDoc.id;
      const schoolData = schoolDoc.data();
      
      const q = query(collection(db, 'students'), where('schoolId', '==', schoolId));
      const studentsSnapshot = await getDocs(q);
      const studentsCount = studentsSnapshot.size;
      
      batch.update(doc(db, 'schools', schoolId), { studentsCount });
      batchCount++;
      
      results.push({
        schoolId,
        name: schoolData.name || 'Unknown',
        studentsCount
      });
      
      if (batchCount >= 500) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }
    
    if (batchCount > 0) {
      await batch.commit();
    }

    console.table(results);
    console.log("Migration completed.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

run();
