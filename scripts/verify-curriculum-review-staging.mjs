import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, applicationDefault, deleteApp } from 'firebase-admin/app';
import { initializeFirestore } from 'firebase-admin/firestore';

// Read-only verification of the actual ITALO scope. No users, pupils or secrets read.
assert.equal(process.env.PEDAGOGY_FIREBASE_PROJECT_ID, 'ecoscolaire-staging');
assert.equal(process.env.PEDAGOGY_STAGING_E2E, 'true');
const source = readFileSync('src/features/pedagogy/resources/curriculumReviewManifest.ts', 'utf8');
const proposals = JSON.parse(source.slice(source.indexOf('= ') + 2).trim().replace(/;$/, ''));
const app = initializeApp({ projectId: 'ecoscolaire-staging', credential: applicationDefault() }, 'curriculum-owner-readonly');
const db = initializeFirestore(app, { preferRest: true });
try {
  const schoolId = 'school-italo-official', school = await db.doc('schools/' + schoolId).get();
  assert(school.exists, 'ITALO Staging school missing');
  const academicYearId = school.data().activeAcademicYearId;
  const year = await db.doc('academicYears/' + academicYearId).get();
  assert.equal(year.data()?.schoolId, schoolId); assert.equal(year.data()?.status, 'active');
  const classes = (await db.collection('classes').where('schoolId', '==', schoolId).get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.isActive !== false);
  assert.equal(classes.length, 34);
  for (const p of proposals) assert.equal(classes.filter(c => c.catalogLevelId === p.catalogLevelId).length, 1, p.id + ' exact active class mapping');
  const reviews = (await db.collection('curriculumProposalReviews').where('schoolId', '==', schoolId).get()).docs.map(d => d.data()).filter(d => d.academicYearId === academicYearId);
  const current = classes.map(c => { const p = proposals.find(p => p.catalogLevelId === c.catalogLevelId); return reviews.find(d => d.classId === c.id && d.proposalId === p.id && d.sourceVersion === p.sourceVersion && d.mappingVersion === p.mappingVersion); });
  console.log(JSON.stringify({ verification: 'ITALO_STAGING_READONLY', sha: process.env.EXPECTED_STAGING_SHA || null, schoolId, academicYearId, totalProposals: classes.length, highConfidence: proposals.filter(p => p.highConfidence).length, toReview: proposals.filter(p => !p.highConfidence).length, missingSufficientSource: proposals.filter(p => p.missingSource).length, groups: Object.fromEntries([...new Set(proposals.map(p => p.group))].map(g => [g, proposals.filter(p => p.group === g).length])), ownerDecisionsRecorded: current.filter(Boolean).length, approved: current.filter(d => d?.decision === 'APPROVED').length, requestChange: current.filter(d => d?.decision === 'REQUEST_CHANGE').length, notApplicable: current.filter(d => d?.decision === 'NOT_APPLICABLE').length, pending: current.filter(d => !d).length, writes: 0, openaiCalls: 0, productionTouched: false }));
} finally { await deleteApp(app); }
