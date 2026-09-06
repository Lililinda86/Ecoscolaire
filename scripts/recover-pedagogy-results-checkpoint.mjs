import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { applicationDefault } = require('firebase-admin/app');

// One-time recovery for an interrupted, wholly synthetic test. Never generalize
// this into a school deletion utility. No real school identifiers are accepted.
const project = 'ecoscolaire-staging';
const schoolId = 'pedagogy-results-b86ee2f3dc4e13c7';
const sourceRun = '34053765899', sourceAttempt = 2;
assert.equal(process.env.GITHUB_REPOSITORY, 'Lililinda86/Ecoscolaire');
assert.equal(process.env.GITHUB_REF, 'refs/heads/staging');
assert.equal(process.env.PEDAGOGY_RECOVERY_CONFIRMATION, 'RECOVER_SYNTHETIC_RESULTS_34053765899');
assert.ok(process.env.GH_TOKEN, 'GitHub source-run verification required');
const gh = async (suffix) => {
  const response = await fetch('https://api.github.com/repos/Lililinda86/Ecoscolaire/' + suffix, {
    headers: { Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200, 'Source-run metadata unavailable');
  return response.json();
};
const run = await gh('actions/runs/' + sourceRun + '/attempts/' + sourceAttempt);
assert.equal(run.head_sha, '6bdcc955f6d55f7d41d8f962f6fcfce22feb200b');
assert.equal(run.head_branch, 'staging');
assert.equal(run.path, '.github/workflows/pedagogy-release-gate.yml');
assert.equal(run.status, 'completed');
assert.equal(run.conclusion, 'failure');
const jobs = await gh('actions/runs/' + sourceRun + '/attempts/' + sourceAttempt + '/jobs?per_page=100');
const steps = jobs.jobs.filter(job => job.name.includes('exact-staging')).flatMap(job => job.steps);
const step = steps.find(item => item.name === 'Synthetic canonical results and teacher-declared support');
assert.equal(step?.conclusion, 'failure');
assert.equal(step.started_at, '2026-09-06T19:15:46Z');
assert.equal(step.completed_at, '2026-09-06T19:18:48Z');
const earliest = Date.parse(step.started_at), latest = Date.parse(step.completed_at) + 1000;
const token = (await applicationDefault().getAccessToken()).access_token;
const root = 'projects/' + project + '/databases/(default)/documents';
const base = 'https://firestore.googleapis.com/v1/' + root;
async function request(url, body, allow404 = false) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  });
  if (allow404 && response.status === 404) return null;
  assert.ok(response.ok, 'STAGING_RECOVERY_HTTP_' + response.status);
  return response.json();
}
const collections = ['academicYears', 'periods', 'classes', 'teachingWeeks', 'classPrograms', 'staff', 'users', 'students', 'subjects', 'classSubjects', 'teacherAssignments', 'lessonPreparations', 'assessmentItems', 'weeklyAssessments', 'evaluations', 'grades', 'pedagogyObservations', 'pedagogyObservationBatches', 'pedagogyRemediations', 'pedagogyRemediationRequests', 'pedagogyAssessmentPublications', 'pedagogyResultBatches', 'audit_logs'];
async function scoped(collectionId) {
  const rows = await request(base + ':runQuery', { structuredQuery: {
    from: [{ collectionId }], select: { fields: [{ fieldPath: 'schoolId' }] },
    where: { fieldFilter: { field: { fieldPath: 'schoolId' }, op: 'EQUAL', value: { stringValue: schoolId } } }, limit: 61,
  } });
  const docs = rows.flatMap(row => row.document ? [row.document] : []);
  assert.ok(docs.length <= 60, 'Unexpected fixture size');
  for (const doc of docs) {
    assert.equal(doc.fields.schoolId.stringValue, schoolId);
    assert.ok(doc.name.startsWith(root + '/' + collectionId + '/'));
    assert.equal(doc.name.slice(root.length + 1).split('/').length, 2);
  }
  // This interrupted run never reached grades or support; refuse any changed scope.
  if (['grades', 'pedagogyObservations', 'pedagogyRemediations'].includes(collectionId)) assert.equal(docs.length, 0);
  return docs;
}
const school = await request(base + '/schools/' + schoolId, null, true);
assert.ok(school, 'Expected fixture missing: stop rather than broaden recovery');
assert.equal(school.fields.name.stringValue, 'Synthetic results school');
assert.equal(school.fields.schoolCode.stringValue, 'SYNTHETIC');
const docs = [school];
for (const collection of collections) docs.push(...await scoped(collection));
assert.ok(docs.length > 20 && docs.length <= 60);
for (const doc of docs) {
  assert.ok(Date.parse(doc.createTime) >= earliest && Date.parse(doc.createTime) <= latest, 'Outside source test window');
  assert.ok(Date.parse(doc.updateTime) <= latest, 'Modified after source test: stop');
}
const uid = schoolId + '-secretary';
const identityBase = 'https://identitytoolkit.googleapis.com/v1/projects/' + project;
const identity = await request(identityBase + '/accounts:lookup', { localId: [uid] });
assert.equal(identity.users?.length, 1);
assert.equal(identity.users[0].localId, uid);
assert.equal(identity.users[0].email, schoolId + '@example.invalid');
assert.ok(Number(identity.users[0].createdAt) >= earliest && Number(identity.users[0].createdAt) <= latest);
console.log(JSON.stringify({ sourceRun, sourceAttempt, verifiedSyntheticDocuments: docs.length, verifiedSyntheticAuthUsers: 1, mode: process.argv.includes('--delete-exact-fixture') ? 'delete-exact' : 'read-only' }));
if (process.argv.includes('--delete-exact-fixture')) {
  await request(base + ':commit', { writes: docs.map(doc => ({ delete: doc.name, currentDocument: { updateTime: doc.updateTime } })) });
  await request(identityBase + '/accounts:delete', { localId: uid });
  assert.equal(await request(base + '/schools/' + schoolId, null, true), null);
  for (const collection of collections) assert.equal((await scoped(collection)).length, 0);
  assert.ok(!(await request(identityBase + '/accounts:lookup', { localId: [uid] })).users?.length);
  console.log('EXACT_SYNTHETIC_RECOVERY_VERIFIED; PRODUCTION_TOUCHED=NO');
}
