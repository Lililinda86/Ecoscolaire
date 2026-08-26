import fs from 'fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { test } from '@playwright/test';

const { describe, beforeAll, beforeEach, afterAll } = test;
let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'ecoscolaire-grades-security',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      ...['owner', 'director', 'secretary', 'teacher', 'teacher2', 'accountant', 'parent', 'student', 'driver', 'boardViewer'].map(role =>
        setDoc(doc(db, 'users', `grades-${role}`), { role: role === 'teacher2' ? 'teacher' : role, schoolId: 'school-a', isActive: true })),
      setDoc(doc(db, 'users', 'grades-owner-b'), { role: 'owner', schoolId: 'school-b', isActive: true }),
      setDoc(doc(db, 'evaluations', 'eval-a'), { id: 'eval-a', schoolId: 'school-a', teacherUserId: 'grades-teacher', status: 'open' }),
      setDoc(doc(db, 'grades', 'grade-a'), { id: 'grade-a', schoolId: 'school-a', teacherUserId: 'grades-teacher', studentId: 'student-a', evaluationId: 'eval-a' }),
      setDoc(doc(db, 'gradeBatchRequests', 'request-a'), { schoolId: 'school-a', actorUid: 'grades-teacher' }),
    ]);
  });
});

describe('Grades and Evaluations backend-only privacy', () => {
  test('scopes evaluation reads to oversight, secretary and owning teacher', async () => {
    for (const role of ['owner', 'director', 'secretary', 'teacher']) {
      await assertSucceeds(getDoc(doc(env.authenticatedContext(`grades-${role}`).firestore(), 'evaluations', 'eval-a')));
    }
    for (const role of ['teacher2', 'accountant', 'parent', 'student', 'driver', 'boardViewer']) {
      await assertFails(getDoc(doc(env.authenticatedContext(`grades-${role}`).firestore(), 'evaluations', 'eval-a')));
    }
    await assertFails(getDoc(doc(env.authenticatedContext('grades-owner-b').firestore(), 'evaluations', 'eval-a')));
  });

  test('allows only a school-and-owner-scoped teacher query', async () => {
    const ownDb = env.authenticatedContext('grades-teacher').firestore();
    await assertSucceeds(getDocs(query(collection(ownDb, 'evaluations'), where('schoolId', '==', 'school-a'), where('teacherUserId', '==', 'grades-teacher'))));
    await assertSucceeds(getDocs(query(collection(ownDb, 'grades'), where('schoolId', '==', 'school-a'), where('teacherUserId', '==', 'grades-teacher'))));
    await assertFails(getDocs(query(collection(ownDb, 'grades'), where('schoolId', '==', 'school-a'))));
    const otherDb = env.authenticatedContext('grades-teacher2').firestore();
    await assertFails(getDocs(query(collection(otherDb, 'grades'), where('schoolId', '==', 'school-a'), where('teacherUserId', '==', 'grades-teacher'))));
  });

  test('keeps raw grades private from secretary and all non-owning roles', async () => {
    for (const role of ['owner', 'director', 'teacher']) {
      await assertSucceeds(getDoc(doc(env.authenticatedContext(`grades-${role}`).firestore(), 'grades', 'grade-a')));
    }
    for (const role of ['secretary', 'teacher2', 'accountant', 'parent', 'student', 'driver', 'boardViewer']) {
      await assertFails(getDoc(doc(env.authenticatedContext(`grades-${role}`).firestore(), 'grades', 'grade-a')));
    }
  });

  test('denies every direct evaluation, grade and idempotency mutation', async () => {
    for (const role of ['owner', 'director', 'secretary', 'teacher']) {
      const db = env.authenticatedContext(`grades-${role}`).firestore();
      await assertFails(setDoc(doc(db, 'evaluations', `direct-${role}`), { schoolId: 'school-a' }));
      await assertFails(updateDoc(doc(db, 'evaluations', 'eval-a'), { status: 'locked' }));
      await assertFails(deleteDoc(doc(db, 'evaluations', 'eval-a')));
      await assertFails(setDoc(doc(db, 'grades', `direct-${role}`), { schoolId: 'school-a' }));
      await assertFails(updateDoc(doc(db, 'grades', 'grade-a'), { score: 0 }));
      await assertFails(deleteDoc(doc(db, 'grades', 'grade-a')));
      await assertFails(getDoc(doc(db, 'gradeBatchRequests', 'request-a')));
    }
  });
});

afterAll(async () => env.cleanup());
