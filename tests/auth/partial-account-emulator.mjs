import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(authHost, 'Auth Emulator requis');
assert.ok(firestoreHost, 'Firestore Emulator requis');

const projectId = 'demo-no-project';
const authBase = `http://${authHost}/identitytoolkit.googleapis.com/v1`;
const firestoreBase = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents`;

const authRequest = async (operation, body) => {
  const response = await fetch(`${authBase}/${operation}?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json() };
};

const createAuthUser = async email => {
  const result = await authRequest('accounts:signUp', {
    email,
    password: randomBytes(32).toString('base64url'),
    returnSecureToken: true,
  });
  assert.equal(result.response.ok, true);
  return result.payload;
};

const toFirestoreFields = data => Object.fromEntries(Object.entries(data).map(([key, value]) => {
  if (typeof value === 'boolean') return [key, { booleanValue: value }];
  return [key, { stringValue: String(value) }];
}));

const writeProfile = async (uid, data, bearer) => fetch(`${firestoreBase}/users/${uid}`, {
  method: 'PATCH',
  headers: {
    authorization: `Bearer ${bearer}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ fields: toFirestoreFields(data) }),
});

const profilePayload = (uid, email) => ({
  id: uid,
  email,
  role: 'teacher',
  schoolId: 'school-a',
  active: true,
  isActive: true,
  status: 'active',
  createdAt: new Date().toISOString(),
});

const partialEmail = `partial-${Date.now()}@example.test`;
const partialUser = await createAuthUser(partialEmail);

const deniedProfileWrite = await writeProfile(
  partialUser.localId,
  profilePayload(partialUser.localId, partialEmail),
  partialUser.idToken,
);
assert.equal(deniedProfileWrite.status, 403);

const missingProfile = await fetch(`${firestoreBase}/users/${partialUser.localId}`, {
  headers: { authorization: `Bearer ${partialUser.idToken}` },
});
assert.equal(missingProfile.status, 404);

const deniedSchoolRead = await fetch(`${firestoreBase}/schools/school-a`, {
  headers: { authorization: `Bearer ${partialUser.idToken}` },
});
assert.equal(deniedSchoolRead.status, 403);

const duplicate = await authRequest('accounts:signUp', {
  email: partialEmail,
  password: randomBytes(32).toString('base64url'),
  returnSecureToken: true,
});
assert.equal(duplicate.response.status, 400);
assert.equal(duplicate.payload.error?.message, 'EMAIL_EXISTS');

const resetEmail = `reset-failure-${Date.now()}@example.test`;
const resetUser = await createAuthUser(resetEmail);
const profileWrite = await writeProfile(
  resetUser.localId,
  profilePayload(resetUser.localId, resetEmail),
  'owner',
);
assert.equal(profileWrite.ok, true);

// Échec déterministe de l'appel reset après succès Auth + Firestore.
const resetFailure = await authRequest('accounts:sendOobCode', {
  requestType: 'PASSWORD_RESET',
  email: 'adresse-invalide',
});
assert.equal(resetFailure.response.ok, false);

const persistedProfile = await fetch(`${firestoreBase}/users/${resetUser.localId}`, {
  headers: { authorization: 'Bearer owner' },
});
assert.equal(persistedProfile.ok, true);

console.log('Auth/Firestore Emulators : états partiels correctement bloqués et détectés.');
