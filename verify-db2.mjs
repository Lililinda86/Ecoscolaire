import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, getDoc, connectFirestoreEmulator } from 'firebase/firestore';
import { connectAuthEmulator } from 'firebase/auth';

const app = initializeApp({
  apiKey: "AIzaSyCWm59UvkOsyHWx9gJXHf0m9qH7d3Droh0",
  authDomain: "ecoscolaire-c5861.firebaseapp.com",
  projectId: "ecoscolaire-c5861",
});
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099");
connectFirestoreEmulator(db, "127.0.0.1", 8080);

async function test() {
  try {
    await signInWithEmailAndPassword(auth, 'superadmin.test@ecoscolaire.com', 'Test@2026Super!');
    console.log('Logged in as superAdmin');
    
    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', 'superadmin.test@ecoscolaire.com')));
    console.log(`User query returned ${userSnap.docs.length} docs`);
    
    const q = query(collection(db, 'classes'), where('schoolId', '==', 'school-alpha-001'));
    const snap = await getDocs(q);
    console.log(`Found ${snap.docs.length} classes in Alpha.`);
    
  } catch(e) {
    console.error('Error fetching:', e.message);
  }
  process.exit(0);
}
test();
