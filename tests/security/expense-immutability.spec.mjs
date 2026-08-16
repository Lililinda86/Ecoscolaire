import { test, expect } from '@playwright/test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const schoolA = 'expense-school-a';
const schoolB = 'expense-school-b';

test.beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'ecoscolaire-expense-immutability',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users', 'owner-a'), { role: 'owner', schoolId: schoolA, active: true }),
      setDoc(doc(db, 'users', 'secretary-a'), { role: 'secretary', schoolId: schoolA, active: true }),
      setDoc(doc(db, 'users', 'board-a'), { role: 'boardViewer', schoolId: schoolA, active: true }),
      setDoc(doc(db, 'users', 'owner-b'), { role: 'owner', schoolId: schoolB, active: true }),
      setDoc(doc(db, 'expenses', 'posted-a'), {
        id: 'posted-a', schoolId: schoolA, amount: 5000, date: '2026-08-16', person: 'Vendor',
        reason: 'Supplies', category: 'SUPPLIES', kind: 'EXPENSE', status: 'POSTED', createdBy: 'owner-a',
      }),
      setDoc(doc(db, 'payments', 'posted-payment-a'), {
        id: 'posted-payment-a', schoolId: schoolA, studentId: 'student-a', amount: 5000,
        date: '2026-08-16', method: 'cash', status: 'completed',
      }),
    ]);
  });
});

test.afterAll(async () => testEnv.cleanup());

test('owner and secretary may read same-school expenses but no client may create them', async () => {
  const ownerDb = testEnv.authenticatedContext('owner-a').firestore();
  const secretaryDb = testEnv.authenticatedContext('secretary-a').firestore();
  await assertSucceeds(getDoc(doc(ownerDb, 'expenses', 'posted-a')));
  await assertSucceeds(getDocs(query(collection(secretaryDb, 'expenses'), where('schoolId', '==', schoolA))));
  for (const db of [ownerDb, secretaryDb]) {
    await assertFails(setDoc(doc(db, 'expenses', 'forged'), {
      id: 'forged', schoolId: schoolA, amount: 5000, date: '2026-08-16', person: 'X', reason: 'X',
    }));
  }
});

test('posted expenses deny direct update and delete for owner and secretary', async () => {
  for (const uid of ['owner-a', 'secretary-a']) {
    const db = testEnv.authenticatedContext(uid).firestore();
    await assertFails(updateDoc(doc(db, 'expenses', 'posted-a'), { amount: 1 }));
    await assertFails(updateDoc(doc(db, 'expenses', 'posted-a'), { category: 'OTHER' }));
    await assertFails(updateDoc(doc(db, 'expenses', 'posted-a'), { date: '2026-08-17' }));
    await assertFails(updateDoc(doc(db, 'expenses', 'posted-a'), { createdBy: 'attacker' }));
    await assertFails(updateDoc(doc(db, 'expenses', 'posted-a'), { status: 'REVERSED' }));
    await assertFails(deleteDoc(doc(db, 'expenses', 'posted-a')));
  }
});

test('BoardViewer raw expense access and every mutation are denied', async () => {
  const db = testEnv.authenticatedContext('board-a').firestore();
  await assertFails(getDoc(doc(db, 'expenses', 'posted-a')));
  await assertFails(getDocs(query(collection(db, 'expenses'), where('schoolId', '==', schoolA))));
  await assertFails(setDoc(doc(db, 'expenses', 'board-write'), { schoolId: schoolA, amount: 5000 }));
  await assertFails(updateDoc(doc(db, 'expenses', 'posted-a'), { amount: 1 }));
  await assertFails(deleteDoc(doc(db, 'expenses', 'posted-a')));
});

test('cross-school reads are denied', async () => {
  const db = testEnv.authenticatedContext('owner-b').firestore();
  await assertFails(getDoc(doc(db, 'expenses', 'posted-a')));
});

test('posted payments deny direct update and delete without changing authorized reads', async () => {
  const ownerDb = testEnv.authenticatedContext('owner-a').firestore();
  const secretaryDb = testEnv.authenticatedContext('secretary-a').firestore();
  await assertSucceeds(getDoc(doc(ownerDb, 'payments', 'posted-payment-a')));
  await assertSucceeds(getDoc(doc(secretaryDb, 'payments', 'posted-payment-a')));
  await assertFails(updateDoc(doc(ownerDb, 'payments', 'posted-payment-a'), { amount: 1 }));
  await assertFails(deleteDoc(doc(ownerDb, 'payments', 'posted-payment-a')));
  await assertFails(setDoc(doc(ownerDb, 'payments', 'forged-payment'), { schoolId: schoolA, amount: 1 }));
  expect(true).toBe(true);
});
