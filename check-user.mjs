import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCWm59UvkOsyHWx9gJXHf0m9qH7d3Droh0",
  authDomain: "ecoscolaire-c5861.firebaseapp.com",
  projectId: "ecoscolaire-c5861"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function test() {
  await signInWithEmailAndPassword(auth, 'superadmin.test@ecoscolaire.com', 'Test@2026Super!');
  const saUid = auth.currentUser.uid;
  const snap = await getDoc(doc(db, 'users', saUid));
  console.log("Exists:", snap.exists());
  if (snap.exists()) {
    console.log("Data:", snap.data());
  }
  
  try {
    await setDoc(doc(db, 'users', saUid), snap.data());
    console.log("setDoc succeeded!");
  } catch (e) {
    console.error("setDoc failed:", e);
  }
  process.exit(0);
}
test();
