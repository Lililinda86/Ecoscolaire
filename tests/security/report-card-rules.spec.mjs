import fs from 'fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { test } from '@playwright/test';

const { describe, beforeAll, beforeEach, afterAll } = test;
let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'ecoscolaire-report-cards-security',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      ...['owner', 'director', 'secretary', 'teacher', 'accountant', 'parent', 'student', 'driver', 'boardViewer'].map(role =>
        setDoc(doc(db, 'users', `rc-${role}`), { role, schoolId: 'school-a', isActive: true })),
      setDoc(doc(db, 'users', 'rc-owner-b'), { role: 'owner', schoolId: 'school-b', isActive: true }),
      setDoc(doc(db, 'reportCards', 'rc-a'), {
        id: 'rc-a', schoolId: 'school-a', status: 'published', immutable: true, studentId: 'student-a',
      }),
    ]);
  });
});

describe('W2-05 report-card backend-only privacy', () => {
  test('allows same-school oversight and secretary reads only', async () => {
    for (const role of ['owner', 'director', 'secretary']) {
      const db = env.authenticatedContext(`rc-${role}`).firestore();
      await assertSucceeds(getDoc(doc(db, 'reportCards', 'rc-a')));
      await assertSucceeds(getDocs(query(collection(db, 'reportCards'), where('schoolId', '==', 'school-a'))));
    }
    for (const role of ['teacher', 'accountant', 'parent', 'student', 'driver', 'boardViewer']) {
      await assertFails(getDoc(doc(env.authenticatedContext(`rc-${role}`).firestore(), 'reportCards', 'rc-a')));
    }
    await assertFails(getDoc(doc(env.authenticatedContext('rc-owner-b').firestore(), 'reportCards', 'rc-a')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'reportCards', 'rc-a')));
  });

  test('denies every direct create, update and physical delete', async () => {
    for (const role of ['owner', 'director', 'secretary', 'teacher']) {
      const db = env.authenticatedContext(`rc-${role}`).firestore();
      await assertFails(setDoc(doc(db, 'reportCards', `direct-${role}`), { schoolId: 'school-a', status: 'draft' }));
      await assertFails(updateDoc(doc(db, 'reportCards', 'rc-a'), { status: 'draft', immutable: false }));
      await assertFails(deleteDoc(doc(db, 'reportCards', 'rc-a')));
    }
  });
});

afterAll(async () => env.cleanup());
