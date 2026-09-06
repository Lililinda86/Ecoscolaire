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
      setDoc(doc(db, 'teachingConfirmations', 'confirmation-a'), { schoolId: 'school-a', status: 'partially_taught', excerpts: ['Private lesson'] }),
      setDoc(doc(db, 'pedagogyObservations', 'observation-a'), { schoolId: 'school-a', studentId: 'synthetic-pupil', state: 'not_observed', comment: 'Private observation' }),
      setDoc(doc(db, 'pedagogyClassPolicies', 'policy-a'), { schoolId: 'school-a', version: 1 }),
      setDoc(doc(db, 'pedagogyClassPolicies/policy-a/versions/1'), { schoolId: 'school-a', version: 1 }),
      setDoc(doc(db, 'pedagogyFridayConfigurations/school-a'), { schoolId: 'school-a', enabled: false }),
      setDoc(doc(db, 'pedagogyFridayConfigurations/school-a/versions/1'), { schoolId: 'school-a', enabled: false }),
      setDoc(doc(db, 'pedagogyFridayRuns/run-a'), { schoolId: 'school-a', status: 'succeeded' }),
      setDoc(doc(db, 'pedagogyAssessmentPublications/publication-a'), { schoolId: 'school-a', items: ['Synthetic private correction'] }),
      setDoc(doc(db, 'grades/grade-a/pedagogyHistory/entry-a'), { schoolId: 'school-a', previous: null }),
      setDoc(doc(db, 'assessmentItems', 'item-a'), { id: 'item-a', weeklyAssessmentId: 'assessment-a', schoolId: 'school-a', correctionGuide: 'Privé', expectedAnswer: 'Privé' })
    ]);
  });
});
describe('Pedagogy Lot C protected weekly assessments', () => {
  test('individual support and its history are private, server-written only', async () => {
    const paths = ['pedagogyRemediations/support-a', 'pedagogyRemediations/support-a/history/1'];
    await env.withSecurityRulesDisabled(async context => {
      for (const path of [...paths, 'pedagogyRemediationRequests/receipt-a']) await setDoc(doc(context.firestore(), path), { schoolId: 'school-a', status: 'proposed' });
    });
    for (const uid of ['secretary-a', 'director-a', 'owner-a', 'super', 'teacher-a', 'board-a', 'secretary-b']) {
      const db = env.authenticatedContext(uid).firestore();
      for (const path of paths) {
        if (['secretary-a', 'director-a', 'owner-a', 'super'].includes(uid)) await assertSucceeds(getDoc(doc(db, path)));
        else await assertFails(getDoc(doc(db, path)));
        await assertFails(setDoc(doc(db, path), { schoolId: 'school-a', status: 'reviewed' }));
      }
      await assertFails(getDoc(doc(db, 'pedagogyRemediationRequests/receipt-a')));
      await assertFails(setDoc(doc(db, 'pedagogyRemediationRequests/forged'), { schoolId: 'school-a' }));
    }
    for (const path of paths) await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path)));
  });
  test('secretary, director, owner and superAdmin can read same-school documents', async () => {
    for (const uid of ['secretary-a', 'director-a', 'owner-a', 'super']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertSucceeds(getDoc(doc(db, 'weeklyAssessments', 'assessment-a'))); await assertSucceeds(getDoc(doc(db, 'assessmentItems', 'item-a')));
      await assertSucceeds(getDoc(doc(db, 'teachingConfirmations', 'confirmation-a')));
      for (const path of ['pedagogyObservations/observation-a', 'pedagogyClassPolicies/policy-a', 'pedagogyClassPolicies/policy-a/versions/1', 'pedagogyFridayConfigurations/school-a', 'pedagogyFridayConfigurations/school-a/versions/1', 'pedagogyFridayRuns/run-a', 'pedagogyAssessmentPublications/publication-a', 'grades/grade-a/pedagogyHistory/entry-a']) await assertSucceeds(getDoc(doc(db, path)));
    }
  });
  test('cross-school, teacher, boardViewer and anonymous cannot read raw assessment or correction guide', async () => {
    for (const uid of ['secretary-b', 'teacher-a', 'board-a']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, 'weeklyAssessments', 'assessment-a'))); await assertFails(getDoc(doc(db, 'assessmentItems', 'item-a')));
      await assertFails(getDoc(doc(db, 'teachingConfirmations', 'confirmation-a')));
      for (const path of ['pedagogyObservations/observation-a', 'pedagogyClassPolicies/policy-a', 'pedagogyClassPolicies/policy-a/versions/1', 'pedagogyFridayConfigurations/school-a', 'pedagogyFridayConfigurations/school-a/versions/1', 'pedagogyFridayRuns/run-a', 'pedagogyAssessmentPublications/publication-a', 'grades/grade-a/pedagogyHistory/entry-a']) await assertFails(getDoc(doc(db, path)));
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
      await assertFails(setDoc(doc(db, 'teachingConfirmations', 'forged'), { schoolId: 'school-a', status: 'taught' }));
      await assertFails(setDoc(doc(db, 'teachingConfirmationBatches', 'forged'), { schoolId: 'school-a' }));
      for (const path of ['pedagogyObservations/forged', 'pedagogyClassPolicies/forged', 'pedagogyClassPolicies/policy-a/versions/2', 'pedagogyObservationBatches/forged', 'pedagogyFridayConfigurations/school-a', 'pedagogyFridayConfigurations/school-a/versions/2', 'pedagogyFridayRuns/run-a', 'pedagogyAssessmentPublications/publication-a', 'grades/grade-a/pedagogyHistory/entry-a', 'pedagogyResultBatches/forged']) await assertFails(setDoc(doc(db, path), { schoolId: 'school-a', state: 'acquired' }));
    }
  });
});
afterAll(async () => env.cleanup());
