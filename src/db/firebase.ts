import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCWm59UvkOsyHWx9gJXHf0m9qH7d3Droh0",
  authDomain: "ecoscolaire-c5861.firebaseapp.com",
  projectId: "ecoscolaire-c5861",
  storageBucket: "ecoscolaire-c5861.firebasestorage.app",
  messagingSenderId: "329523025972",
  appId: "1:329523025972:web:052855ab83a9da2ea49261",
  measurementId: "G-L9QJQYQGHH"
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
