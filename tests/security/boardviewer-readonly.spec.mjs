import { test } from '@playwright/test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'fs';

const { describe, beforeAll, beforeEach, afterAll } = test;
let testEnv;

const schoolA = 'board-school-a';
const schoolB = 'board-school-b';
const rawCollections = [
  'students', 'studentPrivate', 'studentFinance', 'studentParentPrivate', 'studentParentFinance',
  'classes', 'subjects', 'technicalSpecialties', 'academicYears', 'periods', 'evaluations',
  'classPrograms', 'classSubjects', 'grades', 'attendance', 'staff', 'staffAttendance',
  'payments', 'receipts', 'expenses', 'transactions', 'financialBenefits', 'inventory',
  'inventoryTransactions', 'buses', 'busRoutes', 'fuelExpenses', 'maintenances', 'breakdowns',
  'validation_requests', 'cashClosures', 'audit_logs', 'teacherAssignments'
];

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'ecoscolaire-boardviewer-security',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users', 'board-a'), { role: 'boardViewer', schoolId: schoolA, active: true }),
      setDoc(doc(db, 'users', 'board-b'), { role: 'boardViewer', schoolId: schoolB, active: true }),
      setDoc(doc(db, 'users', 'owner-a'), { role: 'owner', schoolId: schoolA, active: true }),
      setDoc(doc(db, 'users', 'secretary-a'), { role: 'secretary', schoolId: schoolA, active: true }),
      setDoc(doc(db, 'schools', schoolA), { name: 'School A' }),
      setDoc(doc(db, 'schools', schoolB), { name: 'School B' }),
      setDoc(doc(db, 'notifications', 'own-notification'), { schoolId: schoolA, userId: 'board-a', message: 'Aggregate ready' }),
      setDoc(doc(db, 'notifications', 'other-notification'), { schoolId: schoolA, userId: 'owner-a', message: 'Private' }),
      ...rawCollections.map(collectionName => setDoc(doc(db, collectionName, 'sample-a'), {
        id: 'sample-a', schoolId: schoolA, userId: 'board-a', studentId: 'student-a', status: 'pending',
        name: 'Individual record', amount: 1000
      }))
    ]);
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('BoardViewer strict read-only and privacy boundary', () => {
  test('allows only the minimum session and own-notification reads', async () => {
    const db = testEnv.authenticatedContext('board-a').firestore();
    await assertSucceeds(getDoc(doc(db, 'users', 'board-a')));
    await assertSucceeds(getDoc(doc(db, 'schools', schoolA)));
    await assertSucceeds(getDoc(doc(db, 'notifications', 'own-notification')));
    await assertFails(getDoc(doc(db, 'users', 'owner-a')));
    await assertFails(getDoc(doc(db, 'schools', schoolB)));
    await assertFails(getDoc(doc(db, 'notifications', 'other-notification')));
  });

  test('denies BoardViewer A and B every raw individual or financial document', async () => {
    for (const uid of ['board-a', 'board-b']) {
      const db = testEnv.authenticatedContext(uid).firestore();
      for (const collectionName of rawCollections) {
        await assertFails(getDoc(doc(db, collectionName, 'sample-a')));
      }
    }
  });

  test('denies every BoardViewer create, update, and delete path', async () => {
    const db = testEnv.authenticatedContext('board-a').firestore();
    await assertFails(updateDoc(doc(db, 'users', 'board-a'), { displayName: 'Changed' }));
    await assertFails(updateDoc(doc(db, 'schools', schoolA), { name: 'Changed' }));
    await assertFails(updateDoc(doc(db, 'notifications', 'own-notification'), { read: true }));
    await assertFails(deleteDoc(doc(db, 'notifications', 'own-notification')));

    for (const collectionName of rawCollections) {
      await assertFails(setDoc(doc(db, collectionName, 'board-created'), {
        id: 'board-created', schoolId: schoolA, userId: 'board-a', status: 'pending'
      }));
      await assertFails(updateDoc(doc(db, collectionName, 'sample-a'), { boardMutation: true }));
      await assertFails(deleteDoc(doc(db, collectionName, 'sample-a')));
    }
  });

  test('keeps representative Owner and Secretary reads intact', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-a').firestore();
    const secretaryDb = testEnv.authenticatedContext('secretary-a').firestore();
    await assertSucceeds(getDoc(doc(ownerDb, 'students', 'sample-a')));
    await assertSucceeds(getDoc(doc(ownerDb, 'payments', 'sample-a')));
    await assertSucceeds(getDoc(doc(secretaryDb, 'students', 'sample-a')));
    await assertSucceeds(getDoc(doc(secretaryDb, 'receipts', 'sample-a')));
    await assertSucceeds(getDoc(doc(secretaryDb, 'notifications', 'own-notification')));
  });
});
