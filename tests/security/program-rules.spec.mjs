import fs from 'fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { test } from '@playwright/test';

const { describe, beforeAll, beforeEach, afterAll } = test;
let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'ecoscolaire-program-security',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      ...['owner', 'director', 'secretary', 'teacher', 'parent', 'student', 'boardViewer'].map(role =>
        setDoc(doc(db, 'users', `program-${role}`), { role, schoolId: 'school-a', isActive: true })),
      setDoc(doc(db, 'users', 'program-owner-b'), { role: 'owner', schoolId: 'school-b', isActive: true }),
      setDoc(doc(db, 'classPrograms', 'program-published'), {
        id: 'program-published', schoolId: 'school-a', academicYearId: 'year-a', classId: 'class-a',
        status: 'published', publishedRevisionId: 'program-published__v1', publishedRevisionNumber: 1,
        draftRevisionId: 'program-published__v1', draftRevisionNumber: 1, hasUnpublishedChanges: false,
      }),
      setDoc(doc(db, 'classPrograms', 'program-draft'), {
        id: 'program-draft', schoolId: 'school-a', academicYearId: 'year-a', classId: 'class-b',
        status: 'draft', draftRevisionId: 'program-draft__v1', draftRevisionNumber: 1, hasUnpublishedChanges: true,
      }),
      setDoc(doc(db, 'classSubjects', 'program-published__v1__subject-a'), {
        id: 'program-published__v1__subject-a', programId: 'program-published', schoolId: 'school-a',
        academicYearId: 'year-a', classId: 'class-a', subjectId: 'subject-a', revisionId: 'program-published__v1',
        revisionNumber: 1, subjectNameSnapshot: 'Fixture', isRequired: true, isActive: true, displayOrder: 0,
      }),
      setDoc(doc(db, 'classSubjects', 'program-draft__v1__subject-a'), {
        id: 'program-draft__v1__subject-a', programId: 'program-draft', schoolId: 'school-a',
        academicYearId: 'year-a', classId: 'class-b', subjectId: 'subject-a', revisionId: 'program-draft__v1',
        revisionNumber: 1, subjectNameSnapshot: 'Fixture', isRequired: true, isActive: true, displayOrder: 0,
      }),
    ]);
  });
});

describe('Programs backend-only RBAC and immutability', () => {
  test('owner/director/secretary read drafts, teacher reads only published, internal-forbidden roles read neither', async () => {
    for (const role of ['owner', 'director', 'secretary']) {
      const db = env.authenticatedContext(`program-${role}`).firestore();
      await assertSucceeds(getDoc(doc(db, 'classPrograms', 'program-draft')));
      await assertSucceeds(getDoc(doc(db, 'classSubjects', 'program-draft__v1__subject-a')));
    }
    const teacher = env.authenticatedContext('program-teacher').firestore();
    await assertSucceeds(getDoc(doc(teacher, 'classPrograms', 'program-published')));
    await assertSucceeds(getDoc(doc(teacher, 'classSubjects', 'program-published__v1__subject-a')));
    await assertFails(getDoc(doc(teacher, 'classPrograms', 'program-draft')));
    await assertFails(getDoc(doc(teacher, 'classSubjects', 'program-draft__v1__subject-a')));
    for (const role of ['parent', 'student', 'boardViewer']) {
      await assertFails(getDoc(doc(env.authenticatedContext(`program-${role}`).firestore(), 'classPrograms', 'program-published')));
    }
    await assertFails(getDoc(doc(env.authenticatedContext('program-owner-b').firestore(), 'classPrograms', 'program-published')));
  });

  test('denies direct create, update and physical delete to every client role', async () => {
    for (const role of ['owner', 'director', 'secretary', 'teacher']) {
      const db = env.authenticatedContext(`program-${role}`).firestore();
      await assertFails(setDoc(doc(db, 'classPrograms', `client-${role}`), { schoolId: 'school-a', status: 'draft' }));
      await assertFails(updateDoc(doc(db, 'classPrograms', 'program-draft'), { status: 'published' }));
      await assertFails(deleteDoc(doc(db, 'classPrograms', 'program-draft')));
      await assertFails(setDoc(doc(db, 'classSubjects', `client-subject-${role}`), { schoolId: 'school-a' }));
      await assertFails(updateDoc(doc(db, 'classSubjects', 'program-draft__v1__subject-a'), { displayOrder: 4 }));
      await assertFails(deleteDoc(doc(db, 'classSubjects', 'program-draft__v1__subject-a')));
    }
  });
});

afterAll(async () => env.cleanup());
