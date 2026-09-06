import fs from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { test } from '@playwright/test';
const { describe, beforeAll, beforeEach, afterAll } = test;
let env;
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'ecoscolaire-pedagogy-lot-c-security', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users', 'secretary-a'), { role: 'secretary', schoolId: 'school-a', isActive: true }),
      setDoc(doc(db, 'users', 'director-a'), { role: 'director', schoolId: 'school-a', isActive: true }),
      setDoc(doc(db, 'users', 'owner-a'), { role: 'owner', schoolId: 'school-a', isActive: true }),
      setDoc(doc(db, 'users', 'super'), { role: 'superAdmin', isActive: true }),
      setDoc(doc(db, 'users', 'teacher-a'), { role: 'teacher', schoolId: 'school-a', isActive: true }),
      setDoc(doc(db, 'users', 'board-a'), { role: 'boardViewer', schoolId: 'school-a', isActive: true }),
      setDoc(doc(db, 'users', 'secretary-b'), { role: 'secretary', schoolId: 'school-b', isActive: true }),
      setDoc(doc(db, 'weeklyAssessments', 'assessment-a'), { id: 'assessment-a', schoolId: 'school-a', status: 'needs_review', teacherValidated: false }),
      setDoc(doc(db, 'assessmentItems', 'item-a'), { id: 'item-a', weeklyAssessmentId: 'assessment-a', schoolId: 'school-a', correctionGuide: 'Privé', expectedAnswer: 'Privé' })
    ]);
  });
});
describe('Pedagogy Lot C protected weekly assessments', () => {
  test('secretary, director, owner and superAdmin can read same-school documents', async () => {
    for (const uid of ['secretary-a', 'director-a', 'owner-a', 'super']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertSucceeds(getDoc(doc(db, 'weeklyAssessments', 'assessment-a'))); await assertSucceeds(getDoc(doc(db, 'assessmentItems', 'item-a')));
    }
  });
  test('cross-school, teacher, boardViewer and anonymous cannot read raw assessment or correction guide', async () => {
    for (const uid of ['secretary-b', 'teacher-a', 'board-a']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, 'weeklyAssessments', 'assessment-a'))); await assertFails(getDoc(doc(db, 'assessmentItems', 'item-a')));
    }
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'assessmentItems', 'item-a')));
  });
  test('all client writes, protected rewrites and teacher-validation spoofing are denied', async () => {
    for (const uid of ['secretary-a', 'director-a', 'owner-a', 'super', 'teacher-a', 'board-a']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(setDoc(doc(db, 'weeklyAssessments', `forged-${uid}`), { schoolId: 'school-a', status: 'ready_to_print', teacherValidated: true }));
      await assertFails(updateDoc(doc(db, 'weeklyAssessments', 'assessment-a'), { teacherValidated: true, teacherValidationRecordedBy: uid }));
      await assertFails(updateDoc(doc(db, 'assessmentItems', 'item-a'), { correctionGuide: 'Altéré', sourceLessonPreparationIds: [] }));
      await assertFails(deleteDoc(doc(db, 'assessmentItems', 'item-a')));
    }
  });
});
afterAll(async () => env.cleanup());
