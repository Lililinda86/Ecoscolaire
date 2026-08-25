import assert from 'node:assert/strict';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT = 'ecoscolaire-c5861';
const COLLECTIONS = {
  teacherAssignments: 'teacherAssignments',
  teacherAssignmentSlots: 'teacherAssignmentSlots',
  staff: 'staff', users: 'users', classes: 'classes', subjects: 'subjects',
  programs: 'classPrograms', periods: 'periods', evaluations: 'evaluations',
  grades: 'grades', reportCards: 'reportCards', attendance: 'attendance',
};

const isFixture = data => data.testFixture === true && typeof data.testRunId === 'string' && data.testRunId.trim().length > 0;
const distribution = (docs, field, fallback = '(missing)') => docs.reduce((result, document) => {
  const value = document.data()[field];
  const key = value === undefined || value === null || value === '' ? fallback : String(value);
  result[key] = (result[key] || 0) + 1;
  return result;
}, {});

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT }, 'italo-w2-03-production-baseline');
try {
  assert.equal(app.options.projectId, PROJECT);
  const db = getFirestore(app);
  const result = { projectId: PROJECT, capturedAt: new Date().toISOString(), collections: {} };
  for (const [label, name] of Object.entries(COLLECTIONS)) {
    const snapshot = await db.collection(name).get();
    const fixtureDocs = snapshot.docs.filter(document => isFixture(document.data()));
    result.collections[label] = {
      count: snapshot.size,
      realCount: snapshot.size - fixtureDocs.length,
      fixtureCount: fixtureDocs.length,
      statuses: distribution(snapshot.docs, 'status'),
      testFixture: distribution(snapshot.docs, 'testFixture'),
      testRunIds: distribution(fixtureDocs, 'testRunId'),
    };
    if (label === 'teacherAssignments') {
      result.collections[label].realAssignments = snapshot.docs.filter(document => !isFixture(document.data())).map(document => {
        const data = document.data();
        return {
          documentId: document.id, schoolId: data.schoolId ?? null,
          academicYearId: data.academicYearId ?? null, staffId: data.teacherStaffId ?? data.staffId ?? null,
          classId: data.classId ?? null, subjectId: data.subjectId ?? null,
          status: data.status ?? null, version: data.version ?? null,
          updateTime: document.updateTime?.toDate().toISOString() ?? null,
        };
      });
    }
  }
  let authCount = 0;
  let pageToken;
  do {
    const page = await getAuth(app).listUsers(1000, pageToken);
    authCount += page.users.length;
    pageToken = page.pageToken;
  } while (pageToken);
  result.auth = { count: authCount, piiPrinted: false };
  console.log(JSON.stringify(result, null, 2));
} finally {
  await deleteApp(app);
}
