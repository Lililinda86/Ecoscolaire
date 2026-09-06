import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId: 'demo-fee-rules', firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') } });
try {
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const role of ['owner', 'director', 'secretary', 'accountant', 'teacher']) await setDoc(doc(db, 'users', role), { schoolId: 'fee-school', role, active: true, isActive: true });
    await setDoc(doc(db, 'schools', 'fee-school'), { name: 'Emulator', active: true, academicYear: '2026-2027' });
    for (const collection of ['studentFeeAssignments', 'studentTransportPlans']) {
      await setDoc(doc(db, collection, 'own'), { schoolId: 'fee-school', studentId: 'student' });
      await setDoc(doc(db, collection, 'other'), { schoolId: 'other-school', studentId: 'other' });
    }
  });
  for (const role of ['owner', 'director', 'secretary', 'accountant']) {
    const db = env.authenticatedContext(role).firestore();
    for (const collection of ['studentFeeAssignments', 'studentTransportPlans']) {
      await assertSucceeds(getDoc(doc(db, collection, 'own')));
      await assertFails(getDoc(doc(db, collection, 'other')));
      await assertFails(setDoc(doc(db, collection, 'forged'), { schoolId: 'fee-school', studentId: 'student', amount: 1 }));
    }
    await assertFails(updateDoc(doc(db, 'schools', 'fee-school'), { feeCatalog: [{ id: 'forged', amount: 1 }] }));
  }
  console.log('PASS fee/transport plan Rules: server-only writes and tenant isolation');
} finally { await env.cleanup(); }
