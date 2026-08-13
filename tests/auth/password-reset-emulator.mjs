import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';

assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth Emulator requis');

const app = initializeApp({
  apiKey: 'demo-api-key',
  authDomain: 'demo-no-project.firebaseapp.com',
  projectId: 'demo-no-project'
}, `auth-reset-test-${Date.now()}`);
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });

const email = `reset-${Date.now()}@example.test`;
await createUserWithEmailAndPassword(auth, email, randomBytes(32).toString('base64url'));
await signOut(auth);
await sendPasswordResetEmail(auth, email);

console.log('Auth Emulator : création et demande de reset réussies.');
