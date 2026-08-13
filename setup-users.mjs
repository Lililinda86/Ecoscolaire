import { randomBytes } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Ce script est réservé aux émulateurs Firebase locaux.');
}

const projectId = process.env.GCLOUD_PROJECT || 'demo-ecoscolaire-local';
initializeApp({ credential: applicationDefault(), projectId });

const auth = getAuth();
const db = getFirestore();
const schoolId = 'test-school-001';
const roles = ['owner', 'director', 'secretary', 'accountant', 'teacher', 'parent', 'driver'];

await db.doc(`schools/${schoolId}`).set({
  id: schoolId,
  name: 'École de test locale',
  schoolCode: 'LOCAL001',
  createdAt: new Date().toISOString()
});

for (const role of roles) {
  const email = `${role}@example.test`;
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({
      email,
      password: randomBytes(32).toString('base64url')
    });
  }

  await db.doc(`users/${user.uid}`).set({
    id: user.uid,
    schoolId,
    email,
    role,
    active: true,
    isActive: true,
    status: 'active',
    createdAt: new Date().toISOString()
  });
}

console.log('Fixtures Auth/Firestore locales créées dans les émulateurs.');
