import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'fs';
import { test } from '@playwright/test';

const { describe, beforeAll, beforeEach, afterAll } = test;
const SCHOOL_A = 'school-a';
const SCHOOL_B = 'school-b';
let testEnv;

const userPayload = (id, role, schoolId = SCHOOL_A, extra = {}) => ({
  id,
  email: `${id}@example.test`,
  role,
  schoolId,
  active: true,
  isActive: true,
  status: 'active',
  createdAt: '2026-08-13T00:00:00.000Z',
  ...extra,
});

async function seedUser(id, role, schoolId = SCHOOL_A, extra = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', id), userPayload(id, role, schoolId, extra));
  });
}

describe('ITALO Auth/RBAC — users', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'ecoscolaire-auth-rbac-rules',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  test('owner → secretary même école : accepté', async () => {
    await seedUser('owner-a', 'owner');
    const db = testEnv.authenticatedContext('owner-a').firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'secretary-new'), userPayload('secretary-new', 'secretary')));
  });

  test('owner → teacher même école : accepté', async () => {
    await seedUser('owner-a', 'owner');
    const db = testEnv.authenticatedContext('owner-a').firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'teacher-new'), userPayload('teacher-new', 'teacher')));
  });

  for (const deniedRole of ['superAdmin', 'owner', 'boardViewer']) {
    test(`owner → ${deniedRole} : refusé`, async () => {
      await seedUser('owner-a', 'owner');
      const db = testEnv.authenticatedContext('owner-a').firestore();
      await assertFails(setDoc(doc(db, 'users', `denied-${deniedRole}`), userPayload(`denied-${deniedRole}`, deniedRole)));
    });
  }

  test('owner → autre schoolId : refusé', async () => {
    await seedUser('owner-a', 'owner');
    const db = testEnv.authenticatedContext('owner-a').firestore();
    await assertFails(setDoc(doc(db, 'users', 'teacher-b'), userPayload('teacher-b', 'teacher', SCHOOL_B)));
  });

  test('director → rôle autorisé même école : accepté', async () => {
    await seedUser('director-a', 'director');
    const db = testEnv.authenticatedContext('director-a').firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'accountant-new'), userPayload('accountant-new', 'accountant')));
  });

  test('director → owner : refusé', async () => {
    await seedUser('director-a', 'director');
    const db = testEnv.authenticatedContext('director-a').firestore();
    await assertFails(setDoc(doc(db, 'users', 'owner-new'), userPayload('owner-new', 'owner')));
  });

  test('secretary → création user : refusé', async () => {
    await seedUser('secretary-a', 'secretary');
    const db = testEnv.authenticatedContext('secretary-a').firestore();
    await assertFails(setDoc(doc(db, 'users', 'teacher-new'), userPayload('teacher-new', 'teacher')));
  });

  test('changement arbitraire de role : refusé', async () => {
    await seedUser('owner-a', 'owner');
    await seedUser('teacher-a', 'teacher');
    const db = testEnv.authenticatedContext('owner-a').firestore();
    await assertFails(updateDoc(doc(db, 'users', 'teacher-a'), { role: 'director' }));
  });

  test('changement de schoolId : refusé', async () => {
    await seedUser('owner-a', 'owner');
    await seedUser('teacher-a', 'teacher');
    const db = testEnv.authenticatedContext('owner-a').firestore();
    await assertFails(updateDoc(doc(db, 'users', 'teacher-a'), { schoolId: SCHOOL_B }));
  });

  test('owner désactive et réactive un rôle géré de la même école : accepté', async () => {
    await seedUser('owner-a', 'owner');
    await seedUser('teacher-a', 'teacher');
    const db = testEnv.authenticatedContext('owner-a').firestore();
    const ref = doc(db, 'users', 'teacher-a');
    await assertSucceeds(updateDoc(ref, { active: false, isActive: false, status: 'inactive' }));
    await assertSucceeds(updateDoc(ref, { active: true, isActive: true, status: 'active' }));
  });

  for (const legacyCase of [
    { name: 'A. legacy avec active uniquement', fields: { active: true } },
    { name: 'B. legacy avec active + status', fields: { active: true, status: 'active' } },
    { name: 'C. legacy avec isActive uniquement', fields: { isActive: true } },
    { name: 'D. schéma actuel', fields: { active: true, isActive: true, status: 'active' } },
  ]) {
    test(`${legacyCase.name} : normalisation administrative acceptée`, async () => {
      await seedUser('owner-a', 'owner');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'teacher-legacy'), {
          id: 'teacher-legacy',
          email: 'teacher-legacy@example.test',
          role: 'teacher',
          schoolId: SCHOOL_A,
          createdAt: '2025-01-01T00:00:00.000Z',
          ...legacyCase.fields,
        });
      });

      const db = testEnv.authenticatedContext('owner-a').firestore();
      await assertSucceeds(updateDoc(doc(db, 'users', 'teacher-legacy'), {
        active: false,
        isActive: false,
        status: 'inactive',
      }));
      await assertSucceeds(updateDoc(doc(db, 'users', 'teacher-legacy'), {
        active: true,
        isActive: true,
        status: 'active',
      }));
    });
  }

  test('compte Auth sans profil : aucun rôle, schoolId ou accès applicatif', async () => {
    const orphanDb = testEnv.authenticatedContext('auth-only-user').firestore();
    await assertFails(setDoc(doc(orphanDb, 'users', 'managed-user'), userPayload('managed-user', 'teacher')));
    await assertFails(setDoc(doc(orphanDb, 'schools', SCHOOL_A), { name: 'forbidden' }));
  });

  test('director ne peut pas désactiver un owner', async () => {
    await seedUser('director-a', 'director');
    await seedUser('owner-a', 'owner');
    const db = testEnv.authenticatedContext('director-a').firestore();
    await assertFails(updateDoc(doc(db, 'users', 'owner-a'), { active: false, isActive: false, status: 'inactive' }));
  });

  test('secretary ne peut pas désactiver un utilisateur', async () => {
    await seedUser('secretary-a', 'secretary');
    await seedUser('teacher-a', 'teacher');
    const db = testEnv.authenticatedContext('secretary-a').firestore();
    await assertFails(updateDoc(doc(db, 'users', 'teacher-a'), { active: false, isActive: false, status: 'inactive' }));
  });

  test('director désactive et réactive un rôle autorisé : accepté', async () => {
    await seedUser('director-a', 'director');
    await seedUser('secretary-a', 'secretary');
    const db = testEnv.authenticatedContext('director-a').firestore();
    const ref = doc(db, 'users', 'secretary-a');
    await assertSucceeds(updateDoc(ref, { active: false, isActive: false, status: 'inactive' }));
    await assertSucceeds(updateDoc(ref, { active: true, isActive: true, status: 'active' }));
  });

  for (const targetRole of ['owner', 'director', 'secretary']) {
    test(`owner supprime ${targetRole} même école : refusé`, async () => {
      await seedUser('owner-a', 'owner');
      await seedUser(`${targetRole}-target`, targetRole);
      const db = testEnv.authenticatedContext('owner-a').firestore();
      await assertFails(deleteDoc(doc(db, 'users', `${targetRole}-target`)));
    });
  }

  test('director supprime secretary : refusé', async () => {
    await seedUser('director-a', 'director');
    await seedUser('secretary-target', 'secretary');
    const db = testEnv.authenticatedContext('director-a').firestore();
    await assertFails(deleteDoc(doc(db, 'users', 'secretary-target')));
  });

  test('superAdmin client supprime user : refusé', async () => {
    await seedUser('superadmin-a', 'superAdmin');
    await seedUser('teacher-target', 'teacher');
    const db = testEnv.authenticatedContext('superadmin-a').firestore();
    await assertFails(deleteDoc(doc(db, 'users', 'teacher-target')));
  });

  test('utilisateur supprime son propre document : refusé', async () => {
    await seedUser('teacher-self', 'teacher');
    const db = testEnv.authenticatedContext('teacher-self').firestore();
    await assertFails(deleteDoc(doc(db, 'users', 'teacher-self')));
  });

  test('owner autre école supprime user : refusé', async () => {
    await seedUser('owner-b', 'owner', SCHOOL_B);
    await seedUser('teacher-a', 'teacher', SCHOOL_A);
    const db = testEnv.authenticatedContext('owner-b').firestore();
    await assertFails(deleteDoc(doc(db, 'users', 'teacher-a')));
  });

  test('aucun password ne peut être écrit dans users', async () => {
    await seedUser('owner-a', 'owner');
    const db = testEnv.authenticatedContext('owner-a').firestore();
    await assertFails(setDoc(doc(db, 'users', 'unsafe-user'), userPayload('unsafe-user', 'teacher', SCHOOL_A, {
      password: 'not-a-real-secret',
    })));
  });

  test('aucun champ d’autorisation arbitraire ne peut être créé', async () => {
    await seedUser('owner-a', 'owner');
    const db = testEnv.authenticatedContext('owner-a').firestore();
    await assertFails(setDoc(doc(db, 'users', 'unsafe-claims'), userPayload('unsafe-claims', 'teacher', SCHOOL_A, {
      schoolIds: [SCHOOL_A, SCHOOL_B],
      permissions: ['*'],
      claims: { admin: true },
      customClaims: { admin: true },
    })));
  });
});
