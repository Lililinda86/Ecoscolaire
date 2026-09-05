import fs from 'fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { test } from '@playwright/test';
const { describe, beforeAll, beforeEach, afterAll } = test;
let env;
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'ecoscolaire-pedagogy-lot-b-security', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users', 'secretary-a'), { role: 'secretary', schoolId: 'school-a', isActive: true }),
      setDoc(doc(db, 'users', 'director-a'), { role: 'director', schoolId: 'school-a', isActive: true }),
      setDoc(doc(db, 'users', 'board-a'), { role: 'boardViewer', schoolId: 'school-a', isActive: true }),
      setDoc(doc(db, 'users', 'teacher-a'), { role: 'teacher', schoolId: 'school-a', isActive: true }),
      setDoc(doc(db, 'users', 'secretary-b'), { role: 'secretary', schoolId: 'school-b', isActive: true }),
      ...['lessonPreparationTemplates', 'lessonPreparations', 'preparationUploads', 'preparationAnalyses'].map(name => setDoc(doc(db, name, `${name}-a`), { id: `${name}-a`, schoolId: 'school-a', status: 'expected' })),
      setDoc(doc(db, 'pedagogyPreparationStats', 'stats-a'), { schoolId: 'school-a', expected: 2, missing: 1 })
    ]);
  });
});
describe('Pedagogy Lot B raw document protection', () => {
  test('secretary and director read their school raw records', async () => {
    for (const uid of ['secretary-a', 'director-a']) for (const name of ['lessonPreparationTemplates', 'lessonPreparations', 'preparationUploads', 'preparationAnalyses']) {
      await assertSucceeds(getDoc(doc(env.authenticatedContext(uid).firestore(), name, `${name}-a`)));
    }
  });
  test('board viewer sees aggregate only and teacher sees neither', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('board-a').firestore(), 'pedagogyPreparationStats', 'stats-a')));
    await assertFails(getDoc(doc(env.authenticatedContext('teacher-a').firestore(), 'pedagogyPreparationStats', 'stats-a')));
    for (const uid of ['board-a', 'teacher-a']) for (const name of ['lessonPreparationTemplates', 'lessonPreparations', 'preparationUploads', 'preparationAnalyses']) {
      await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(), name, `${name}-a`)));
    }
  });
  test('other-school access and every client mutation are denied', async () => {
    for (const name of ['lessonPreparationTemplates', 'lessonPreparations', 'preparationUploads', 'preparationAnalyses']) {
      await assertFails(getDoc(doc(env.authenticatedContext('secretary-b').firestore(), name, `${name}-a`)));
      const db = env.authenticatedContext('secretary-a').firestore();
      await assertFails(setDoc(doc(db, name, `forged-${name}`), { schoolId: 'school-a' }));
      await assertFails(updateDoc(doc(db, name, `${name}-a`), { status: 'validated' }));
      await assertFails(deleteDoc(doc(db, name, `${name}-a`)));
    }
  });
});
afterAll(async () => env.cleanup());
