import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-L9QJQYQGHH"
};

// Check for missing mandatory vars
const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
for (const key of requiredKeys) {
  if (!firebaseConfig[key as keyof typeof firebaseConfig]) {
    throw new Error(`Firebase configuration error: Missing environment variable for ${key}. Check your .env file.`);
  }
}

// Initialiser Firebase
const app = initializeApp(firebaseConfig);

// Initialiser Firestore et Auth
export const db = getFirestore(app);

// Activer la persistance hors-ligne
// Désactivé pour les tests E2E pour éviter les problèmes de cache
/*
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.error("Plusieurs onglets ouverts en même temps, la persistance ne peut être activée que dans un onglet.");
  } else if (err.code === 'unimplemented') {
    console.error("Le navigateur actuel ne supporte pas la persistance IndexedDB pour Firestore.");
  }
});
*/

export const auth = getAuth(app);
export const storage = getStorage(app);

// Application secondaire pour créer des comptes sans déconnecter l'admin
export const createSecondaryUser = async (email: string, pass: string) => {
  const secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp');
  const secondaryAuth = getAuth(secondaryApp);
  const { createUserWithEmailAndPassword, signOut } = await import('firebase/auth');
  
  const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
  await signOut(secondaryAuth);
  
  // Clean up
  const { deleteApp } = await import('firebase/app');
  await deleteApp(secondaryApp);
  
  return userCredential.user;
};
