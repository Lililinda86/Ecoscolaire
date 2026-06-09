import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Remplacez ces valeurs par celles de votre projet Firebase
const firebaseConfig = {
  apiKey: "VOTRE_API_KEY",
  authDomain: "votre-projet.firebaseapp.com",
  projectId: "votre-projet",
  storageBucket: "votre-projet.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);

// Initialiser Firestore et Auth
export const db = getFirestore(app);

// Activer la persistance hors-ligne
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.error("Plusieurs onglets ouverts en même temps, la persistance ne peut être activée que dans un onglet.");
  } else if (err.code === 'unimplemented') {
    console.error("Le navigateur actuel ne supporte pas la persistance IndexedDB pour Firestore.");
  }
});

export const auth = getAuth(app);
