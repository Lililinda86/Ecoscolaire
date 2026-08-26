import assert from 'node:assert/strict';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT = 'ecoscolaire-c5861';
const COLLECTIONS = ['evaluations', 'grades', 'reportCards', 'periods', 'programs', 'classPrograms',
  'teacherAssignments', 'teacherAssignmentSlots', 'staff', 'students', 'classes', 'subjects', 'attendance'];
const isFixture = data => data.testFixture === true && typeof data.testRunId === 'string' && data.testRunId.trim().length > 0;
const distribution = (documents, field, fallback = '(missing)') => documents.reduce((result, document) => {
  const value = document.data()[field];
  const key = value === undefined || value === null || value === '' ? fallback : String(value);
  result[key] = (result[key] || 0) + 1;
  return result;
}, {});

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT }, 'italo-w2-04-production-baseline');
try {
  assert.equal(app.options.projectId, PROJECT);
  const db = getFirestore(app);
  const result = { projectId: PROJECT, capturedAt: new Date().toISOString(), piiPrinted: false, collections: {} };
  for (const name of COLLECTIONS) {
    const snapshot = await db.collection(name).get();
    const fixtureDocs = snapshot.docs.filter(document => isFixture(document.data()));
    const realDocs = snapshot.docs.filter(document => !isFixture(document.data()));
    result.collections[name] = {
      count: snapshot.size,
      realCount: realDocs.length,
      fixtureCount: fixtureDocs.length,
      statuses: distribution(snapshot.docs, 'status'),
      testFixture: distribution(snapshot.docs, 'testFixture'),
      testRunIds: distribution(fixtureDocs, 'testRunId'),
    };
    if (name === 'evaluations' || name === 'grades') {
      result.collections[name].realDocuments = realDocs.map(document => {
        const data = document.data();
        return {
          documentId: document.id,
          status: data.status ?? data.resultStatus ?? null,
          version: data.version ?? null,
          updateTime: document.updateTime?.toDate().toISOString() ?? null,
          schoolId: data.schoolId ?? null,
          academicYearId: data.academicYearId ?? null,
          periodId: data.periodId ?? null,
          classId: data.classId ?? null,
          subjectId: data.subjectId ?? null,
          ...(name === 'grades' ? { studentId: data.studentId ?? null } : {}),
        };
      });
    }
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  await deleteApp(app);
}