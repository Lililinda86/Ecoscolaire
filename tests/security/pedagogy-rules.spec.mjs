import fs from 'fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { test } from '@playwright/test';

const { describe, beforeAll, beforeEach, afterAll } = test;
let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'ecoscolaire-pedagogy-security', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users', 'pedagogy-superAdmin'), { role: 'superAdmin', isActive: true }),
      ...['owner', 'director', 'secretary', 'boardViewer', 'teacher', 'parent'].map(role => setDoc(doc(db, 'users', `pedagogy-${role}`), { role, schoolId: 'school-a', isActive: true })),
      setDoc(doc(db, 'users', 'pedagogy-owner-b'), { role: 'owner', schoolId: 'school-b', isActive: true }),
      setDoc(doc(db, 'curriculumPrograms', 'program-a'), { id: 'program-a', status: 'published', sourceType: 'mock' }),
      setDoc(doc(db, 'curriculumUnits', 'unit-a'), { id: 'unit-a', programId: 'program-a', status: 'published' }),
      setDoc(doc(db, 'schoolCurriculumAdoptions', 'adoption-a'), { id: 'adoption-a', schoolId: 'school-a', status: 'active' }),
      setDoc(doc(db, 'teachingWeeks', 'week-a'), { id: 'week-a', schoolId: 'school-a', status: 'open' }),
      setDoc(doc(db, 'teachingPlans', 'plan-a'), { id: 'plan-a', schoolId: 'school-a', status: 'proposed' }),
      setDoc(doc(db, 'teachingPlanItems', 'item-a'), { id: 'item-a', schoolId: 'school-a', planId: 'plan-a', status: 'proposed' })
    ]);
  });
});

describe('Pedagogy Lot A read matrix and backend-only writes', () => {
  test('proposal reviews and immutable history are tenant scoped and server writable only', async () => {
    for (const path of ['curriculumProposalReviews/review-a', 'curriculumProposalReviews/review-a/history/1', 'curriculumSubjectMappings/mapping-a']) {
      await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), path), { schoolId: 'school-a', decision: 'REQUEST_CHANGE' }));
      for (const role of ['owner', 'secretary']) await assertSucceeds(getDoc(doc(env.authenticatedContext('pedagogy-' + role).firestore(), path)));
      for (const uid of ['pedagogy-owner-b', 'pedagogy-teacher', 'pedagogy-parent']) await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(), path)));
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path)));
      for (const role of ['owner', 'secretary', 'superAdmin']) {
        const target = doc(env.authenticatedContext('pedagogy-' + role).firestore(), path);
        await assertFails(updateDoc(target, { decision: 'APPROVED' })); await assertFails(deleteDoc(target));
      }
    }
  });
  test('curriculum review decisions are scoped and backend-only', async () => {
    const path = 'schoolCurriculumAdoptions/adoption-a/reviewDecisions/decision-a';
    await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), path), { schoolId: 'school-a', reviewOutcome: 'not_applicable' }));
    await assertSucceeds(getDoc(doc(env.authenticatedContext('pedagogy-owner').firestore(), path)));
    await assertFails(getDoc(doc(env.authenticatedContext('pedagogy-owner-b').firestore(), path)));
    await assertFails(updateDoc(doc(env.authenticatedContext('pedagogy-owner').firestore(), path), { reviewOutcome: 'approve' }));
    await assertFails(deleteDoc(doc(env.authenticatedContext('pedagogy-owner').firestore(), path)));
  });
  test('source-watch records are school-scoped and never client-writable', async () => {
    const paths = ['pedagogySourceWatches/watch-a', 'pedagogySourceWatches/watch-a/versions/1', 'pedagogySourceWatches/watch-a/reviews/2', 'pedagogySourceWatchAttempts/attempt-a'];
    await env.withSecurityRulesDisabled(async context => {
      for (const path of paths) await setDoc(doc(context.firestore(), path), { schoolId: 'school-a' });
    });
    for (const path of paths) {
      for (const role of ['owner', 'director', 'secretary']) await assertSucceeds(getDoc(doc(env.authenticatedContext(`pedagogy-${role}`).firestore(), path)));
      for (const uid of ['pedagogy-owner-b', 'pedagogy-teacher', 'pedagogy-parent']) await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(), path)));
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path)));
      for (const role of ['superAdmin', 'owner', 'director', 'secretary', 'boardViewer']) {
        const target = doc(env.authenticatedContext(`pedagogy-${role}`).firestore(), path);
        await assertFails(updateDoc(target, { pendingReview: false }));
        await assertFails(deleteDoc(target));
      }
    }
  });
  test('management roles and board viewer can read their school', async () => {
    for (const role of ['owner', 'director', 'secretary', 'boardViewer']) {
      const db = env.authenticatedContext(`pedagogy-${role}`).firestore();
      await assertSucceeds(getDoc(doc(db, 'curriculumPrograms', 'program-a')));
      await assertSucceeds(getDoc(doc(db, 'schoolCurriculumAdoptions', 'adoption-a')));
      await assertSucceeds(getDoc(doc(db, 'teachingWeeks', 'week-a')));
      await assertSucceeds(getDoc(doc(db, 'teachingPlans', 'plan-a')));
      await assertSucceeds(getDoc(doc(db, 'teachingPlanItems', 'item-a')));

    }
  });

  test('superAdmin can read global curriculum and planning across schools', async () => {
    const db = env.authenticatedContext('pedagogy-superAdmin').firestore();
    await assertSucceeds(getDoc(doc(db, 'curriculumPrograms', 'program-a')));
    await assertSucceeds(getDoc(doc(db, 'schoolCurriculumAdoptions', 'adoption-a')));
    await assertSucceeds(getDoc(doc(db, 'teachingPlans', 'plan-a')));
    await assertSucceeds(getDoc(doc(db, 'teachingPlanItems', 'item-a')));
  });

  test('teacher, parent and other-school users cannot read school planning', async () => {
    for (const uid of ['pedagogy-teacher', 'pedagogy-parent', 'pedagogy-owner-b']) {
      await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(), 'teachingPlans', 'plan-a')));
    }
  });

  test('secretary cannot forge protected identity fields', async () => {
    const db = env.authenticatedContext('pedagogy-secretary').firestore();
    await assertFails(updateDoc(doc(db, 'users', 'pedagogy-secretary'), { role: 'superAdmin' }));
    await assertFails(updateDoc(doc(db, 'users', 'pedagogy-secretary'), { schoolId: 'school-b' }));
  });

  test('all client roles are denied direct lifecycle writes', async () => {
    for (const uid of ['pedagogy-superAdmin', 'pedagogy-owner', 'pedagogy-director', 'pedagogy-secretary', 'pedagogy-boardViewer', 'pedagogy-teacher', 'pedagogy-parent', 'pedagogy-owner-b']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(setDoc(doc(db, 'teachingPlans', `client-${uid}`), { schoolId: 'school-a', status: 'draft' }));
      await assertFails(updateDoc(doc(db, 'teachingPlans', 'plan-a'), { status: 'teacher_validated' }));
      await assertFails(deleteDoc(doc(db, 'teachingPlans', 'plan-a')));
    }
  });
});

afterAll(async () => env.cleanup());
