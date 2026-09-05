import fs from 'fs';
import { test } from '@playwright/test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let environment;

test.beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'ecoscolaire-payment-allocation-rules',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') }
  });
});

test.afterAll(async () => environment.cleanup());

test('payment allocations are tenant-readable and server-write-only', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    await Promise.all([
      setDoc(doc(database, 'users', 'secretary-a'), { role: 'secretary', schoolId: 'school-a', active: true }),
      setDoc(doc(database, 'users', 'owner-a'), { role: 'owner', schoolId: 'school-a', active: true }),
      setDoc(doc(database, 'users', 'secretary-b'), { role: 'secretary', schoolId: 'school-b', active: true }),
      setDoc(doc(database, 'users', 'teacher-a'), { role: 'teacher', schoolId: 'school-a', active: true }),
      setDoc(doc(database, 'paymentAllocations', 'allocation-a'), {
        id: 'allocation-a', allocationId: 'allocation-a', collectionId: 'collection-a', paymentId: 'collection-a',
        receiptId: 'collection-a', schoolId: 'school-a', studentId: 'student-a', academicYear: '2026-2027',
        key: 'tuition:T1', type: 'tuition', label: 'Scolarité T1', amount: 30000, status: 'POSTED'
      })
    ]);
  });

  const secretary = environment.authenticatedContext('secretary-a').firestore();
  const owner = environment.authenticatedContext('owner-a').firestore();
  const crossSchool = environment.authenticatedContext('secretary-b').firestore();
  const teacher = environment.authenticatedContext('teacher-a').firestore();
  await assertSucceeds(getDoc(doc(secretary, 'paymentAllocations', 'allocation-a')));
  await assertSucceeds(getDoc(doc(owner, 'paymentAllocations', 'allocation-a')));
  await assertFails(getDoc(doc(crossSchool, 'paymentAllocations', 'allocation-a')));
  await assertFails(getDoc(doc(teacher, 'paymentAllocations', 'allocation-a')));
  for (const database of [secretary, owner]) {
    await assertFails(setDoc(doc(database, 'paymentAllocations', `forged-${Math.random()}`), {
      schoolId: 'school-a', studentId: 'student-a', amount: 1
    }));
    await assertFails(updateDoc(doc(database, 'paymentAllocations', 'allocation-a'), { amount: 1 }));
    await assertFails(deleteDoc(doc(database, 'paymentAllocations', 'allocation-a')));
  }
});
