import fs from 'fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { test } from '@playwright/test';

const { describe, beforeAll, beforeEach, afterAll } = test;
let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'ecoscolaire-staff-security',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const roles = ['superAdmin', 'owner', 'director', 'secretary', 'accountant', 'teacher', 'driver', 'parent', 'student', 'boardViewer'];
    await Promise.all(roles.map(role => setDoc(doc(db, 'users', `staff-${role}`), {
      role,
      schoolId: role === 'superAdmin' ? null : 'school-a',
      isActive: true,
    })));
    await Promise.all([
      setDoc(doc(db, 'users', 'staff-owner-b'), { role: 'owner', schoolId: 'school-b', isActive: true }),
      setDoc(doc(db, 'staff', 'person-a'), {
        id: 'person-a', schoolId: 'school-a', firstName: 'Fixture', lastName: 'Private',
        phone: '600000000', email: 'private@example.test', salary: 999999,
        bankInformation: 'fixture-only', privateNotes: 'fixture-only',
        staffType: 'teacher', employmentStatus: 'active', isActive: true,
      }),
      setDoc(doc(db, 'staffAttendance', 'staff_school-a_2026-08-23_person-a'), {
        id: 'staff_school-a_2026-08-23_person-a', schoolId: 'school-a', staffId: 'person-a',
        date: '2026-08-23', status: 'present', present: true,
      }),
      setDoc(doc(db, 'staffUserLinks', 'link-a'), {
        schoolId: 'school-a', staffId: 'person-a', userId: 'staff-teacher', isActive: true,
      }),
    ]);
  });
});

describe('Staff privacy and backend-only lifecycle', () => {
  test('only management roles can read the complete same-school Staff document', async () => {
    for (const role of ['superAdmin', 'owner', 'director', 'secretary']) {
      await assertSucceeds(getDoc(doc(env.authenticatedContext(`staff-${role}`).firestore(), 'staff', 'person-a')));
    }
    for (const role of ['accountant', 'teacher', 'driver', 'parent', 'student', 'boardViewer']) {
      await assertFails(getDoc(doc(env.authenticatedContext(`staff-${role}`).firestore(), 'staff', 'person-a')));
    }
    await assertFails(getDoc(doc(env.authenticatedContext('staff-owner-b').firestore(), 'staff', 'person-a')));
  });

  test('denies unauthorized Staff list queries including private fields', async () => {
    const allowed = query(collection(env.authenticatedContext('staff-secretary').firestore(), 'staff'), where('schoolId', '==', 'school-a'));
    await assertSucceeds(getDocs(allowed));
    for (const role of ['teacher', 'driver', 'parent', 'student', 'boardViewer']) {
      const denied = query(collection(env.authenticatedContext(`staff-${role}`).firestore(), 'staff'), where('schoolId', '==', 'school-a'));
      await assertFails(getDocs(denied));
    }
  });

  test('denies direct create, update and physical delete even to privileged clients', async () => {
    for (const role of ['superAdmin', 'owner', 'director', 'secretary']) {
      const db = env.authenticatedContext(`staff-${role}`).firestore();
      await assertFails(setDoc(doc(db, 'staff', `client-${role}`), {
        id: `client-${role}`, schoolId: 'school-a', firstName: 'Client', lastName: 'Denied',
        staffType: 'teacher', employmentStatus: 'active', isActive: true,
      }));
      await assertFails(updateDoc(doc(db, 'staff', 'person-a'), { firstName: 'Forged' }));
      await assertFails(deleteDoc(doc(db, 'staff', 'person-a')));
    }
  });

  test('denies every direct manipulation of canonical Staff/User links', async () => {
    const db = env.authenticatedContext('staff-owner').firestore();
    await assertFails(setDoc(doc(db, 'staffUserLinkByUser', 'target'), { schoolId: 'school-a', staffId: 'person-a', userId: 'target', isActive: true }));
    await assertFails(updateDoc(doc(db, 'staffUserLinks', 'link-a'), { isActive: false }));
    await assertFails(deleteDoc(doc(db, 'staffUserLinks', 'link-a')));
  });
});

describe('Staff attendance isolation and canonical uniqueness', () => {
  test('allows one canonical same-school record but denies alternate duplicate ids', async () => {
    const db = env.authenticatedContext('staff-owner').firestore();
    const payload = {
      id: 'staff_school-a_2026-08-24_person-a', schoolId: 'school-a', staffId: 'person-a',
      date: '2026-08-24', status: 'present', present: true,
    };
    await assertSucceeds(setDoc(doc(db, 'staffAttendance', payload.id), payload));
    await assertFails(setDoc(doc(db, 'staffAttendance', 'duplicate-random-id'), payload));
  });

  test('denies cross-school writes, identity changes and physical delete', async () => {
    const ownerA = env.authenticatedContext('staff-owner').firestore();
    const ownerB = env.authenticatedContext('staff-owner-b').firestore();
    const path = 'staff_school-a_2026-08-23_person-a';
    await assertFails(updateDoc(doc(ownerA, 'staffAttendance', path), { staffId: 'other-person' }));
    await assertFails(deleteDoc(doc(ownerA, 'staffAttendance', path)));
    await assertFails(setDoc(doc(ownerB, 'staffAttendance', 'staff_school-a_2026-08-25_person-a'), {
      id: 'staff_school-a_2026-08-25_person-a', schoolId: 'school-a', staffId: 'person-a',
      date: '2026-08-25', status: 'present', present: true,
    }));
  });
});

afterAll(async () => env.cleanup());
