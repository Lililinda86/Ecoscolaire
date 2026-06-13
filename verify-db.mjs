import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyCWm59UvkOsyHWx9gJXHf0m9qH7d3Droh0",
  authDomain: "ecoscolaire-c5861.firebaseapp.com",
  projectId: "ecoscolaire-c5861",
});
const auth = getAuth(app);
const db = getFirestore(app);

async function test() {
  try {
    await signInWithEmailAndPassword(auth, 'superadmin.test@ecoscolaire.com', 'Test@2026Super!');
    console.log('Logged in as superAdmin');
    
    const snap = await getDocs(collection(db, 'classes'));
    console.log(`Found ${snap.docs.length} total classes in DB.`);
    
    const snap2 = await getDocs(collection(db, 'students'));
    console.log(`Found ${snap2.docs.length} total students in DB.`);
  } catch(e) {
    console.error('Error fetching:', e.message);
  }
  process.exit(0);
}
test();
