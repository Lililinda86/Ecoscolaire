import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { generateTemporaryAuthSecret } from '../utils/authSecurity';
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

const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
let isConfigValid = true;
for (const key of requiredKeys) {
  if (!firebaseConfig[key as keyof typeof firebaseConfig]) {
    console.error(`Firebase configuration error: Missing environment variable for ${key}. Check your .env file.`);
    isConfigValid = false;
  }
}

// Sécurité : Vérifier l'adéquation entre l'environnement et le projet Firebase
if (import.meta.env.MODE === 'production') {
  if (firebaseConfig.projectId === 'ecoscolaire-staging') {
    throw new Error('CRITICAL: Le mode Production ne doit JAMAIS utiliser le projet ecoscolaire-staging');
  }
} else if (import.meta.env.MODE === 'staging') {
  if (firebaseConfig.projectId === 'ecoscolaire-c5861') {
    throw new Error('CRITICAL: Le mode Staging ne doit JAMAIS utiliser le projet ecoscolaire-c5861');
  }
}


if (!isConfigValid) {
  console.warn("Using fallback dummy Firebase configuration to prevent app crash. Auth and Firestore will not work.");
  firebaseConfig.apiKey = firebaseConfig.apiKey || "dummy-api-key";
  firebaseConfig.authDomain = firebaseConfig.authDomain || "dummy.firebaseapp.com";
  firebaseConfig.projectId = firebaseConfig.projectId || "dummy-project";
  firebaseConfig.storageBucket = firebaseConfig.storageBucket || "dummy.appspot.com";
  firebaseConfig.messagingSenderId = firebaseConfig.messagingSenderId || "000000000000";
  firebaseConfig.appId = firebaseConfig.appId || "1:000000000000:web:0000000000000000000000";
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
export const functions = getFunctions(app);

if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  const g = globalThis as unknown as {
    __firestore_emulator_connected__?: boolean;
    __auth_emulator_connected__?: boolean;
    __functions_emulator_connected__?: boolean;
    __storage_emulator_connected__?: boolean;
  };
  if (!g.__firestore_emulator_connected__) {
    const { connectFirestoreEmulator } = await import('firebase/firestore');
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    g.__firestore_emulator_connected__ = true;
  }
  if (!g.__auth_emulator_connected__) {
    const { connectAuthEmulator } = await import('firebase/auth');
    connectAuthEmulator(auth, 'http://127.0.0.1:9099');
    g.__auth_emulator_connected__ = true;
  }
  if (!g.__functions_emulator_connected__) {
    const { connectFunctionsEmulator } = await import('firebase/functions');
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    g.__functions_emulator_connected__ = true;
  }
  if (!g.__storage_emulator_connected__) {
    const { connectStorageEmulator } = await import('firebase/storage');
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    g.__storage_emulator_connected__ = true;
  }
}

// Application secondaire pour créer des comptes sans déconnecter l'admin
export const createSecondaryUserForPasswordSetup = async (email: string) => {
  const secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp');
  const secondaryAuth = getAuth(secondaryApp);
  const { createUserWithEmailAndPassword, signOut } = await import('firebase/auth');

  try {
    const temporarySecret = generateTemporaryAuthSecret();
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, temporarySecret);
    await signOut(secondaryAuth);
    return userCredential.user;
  } finally {
    const { deleteApp } = await import('firebase/app');
    await deleteApp(secondaryApp);
  }
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  const { sendPasswordResetEmail } = await import('firebase/auth');
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
};
