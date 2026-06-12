import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCWm59UvkOsyHWx9gJXHf0m9qH7d3Droh0",
  authDomain: "ecoscolaire-c5861.firebaseapp.com",
  projectId: "ecoscolaire-c5861",
  storageBucket: "ecoscolaire-c5861.firebasestorage.app",
  messagingSenderId: "329523025972",
  appId: "1:329523025972:web:052855ab83a9da2ea49261"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function check() {
  try {
    const cred = await signInWithEmailAndPassword(auth, 'owner.alpha@ecoscolaire.com', 'Test@2026Alpha!');
    console.log("Auth success. UID:", cred.user.uid);
    const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
    console.log("Firestore User exists?", userDoc.exists());
    if (userDoc.exists()) {
      console.log("User data:", userDoc.data());
    }
  } catch (e) {
    console.error("Error:", e);
  }
  process.exit(0);
}
check();
