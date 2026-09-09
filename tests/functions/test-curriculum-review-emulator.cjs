const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
const admin = require('../../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: 'demo-ecoscolaire' });
const { recordCurriculumProposalDecisions: fn } = require('../../functions/lib/pedagogy/curriculumReview');
const { curriculumReviewProposals: proposals } = require('../../functions/lib/pedagogy/curriculumReviewManifest');
const db = admin.firestore(), schoolId = 'review-' + randomBytes(8).toString('hex'), year = schoolId + '-year';
const context = role => ({ auth: { uid: schoolId + '-' + role, token: {} } });
const item = (i, decision = 'APPROVED') => ({ classId: schoolId + '-' + proposals[i].id, proposalId: proposals[i].id, sourceVersion: proposals[i].sourceVersion, mappingVersion: proposals[i].mappingVersion, decision, expectedRevision: 0, decisionNote: 'Synthetic emulator decision only' });
const call = (items, role = 'owner', extra = {}) => fn.run({ schoolId, academicYearId: year, requestId: randomBytes(12).toString('hex'), confirmed: true, items, ...extra }, context(role));
(async () => {
  try {
    await db.doc('academicYears/' + year).create({ schoolId, status: 'active' });
    for (const role of ['owner', 'secretary', 'director', 'superAdmin', 'foreign']) await db.doc('users/' + schoolId + '-' + role).create({ schoolId: role === 'foreign' ? schoolId + '-foreign' : schoolId, role: role === 'foreign' ? 'owner' : role, isActive: true });
    for (const p of proposals) await db.doc('classes/' + schoolId + '-' + p.id).create({ schoolId, isActive: true, catalogLevelId: p.catalogLevelId });
    for (const role of ['secretary', 'director', 'superAdmin', 'foreign']) await assert.rejects(call([item(0)], role), e => e.code === 'permission-denied');
    await assert.rejects(call([item(0)], 'owner', { confirmed: false }), e => e.code === 'invalid-argument');
    for (const field of ['sourceVersion', 'mappingVersion']) await assert.rejects(call([{ ...item(0), [field]: 'stale' }]), e => e.code === 'aborted');
    for (let i = 12; i < 34; i++) if (proposals[i].missingSource) await assert.rejects(call([item(i)]), e => e.code === 'failed-precondition');
    await assert.rejects(call([item(0), item(0)]), e => e.code === 'invalid-argument');
    await assert.rejects(call([item(0), item(1, 'REQUEST_CHANGE')]), e => e.code === 'invalid-argument');
    await db.doc('classes/' + schoolId + '-D02').update({ schoolId: 'foreign' });
    await assert.rejects(call([item(0), item(1)]), e => e.code === 'permission-denied');
    assert.equal((await db.collection('curriculumProposalReviews').where('schoolId', '==', schoolId).get()).size, 0);
    await db.doc('classes/' + schoolId + '-D02').update({ schoolId });
    const requestId = 'idempotency';
    await call([item(0)], 'owner', { requestId });
    assert.equal((await call([item(0)], 'owner', { requestId })).idempotent, true);
    await assert.rejects(call([item(1)], 'owner', { requestId }), e => e.code === 'already-exists');
    await assert.rejects(call([item(0)]), e => e.code === 'aborted');
    await call(Array.from({ length: 11 }, (_, i) => item(i + 1)));
    await call([item(26, 'REQUEST_CHANGE')]);
    await call([{ ...item(26, 'NOT_APPLICABLE'), expectedRevision: 1 }]);
    const stored = await db.collection('curriculumProposalReviews').where('schoolId', '==', schoolId).get();
    assert.equal(stored.size, 13);
    for (const doc of stored.docs) {
      const d = doc.data(); assert.equal(d.decidedBy, schoolId + '-owner'); assert.ok(d.decidedAt.toMillis());
      assert.equal(d.adoptionChanged, false); assert.equal(d.sourceVersion.length, 64); assert.equal(d.mappingVersion.length, 64);
      assert.equal((await doc.ref.collection('history').get()).size, d.revision);
      if (d.proposalId === 'D27') assert.equal((await doc.ref.collection('history').doc('1').get()).data().decision, 'REQUEST_CHANGE');
    }
    assert.equal((await db.collection('audit_logs').where('schoolId', '==', schoolId).get()).size, 14);
    await call([item(12)]); // Conditional, documented preschool mapping: owner individual review only.
    await assert.rejects(call([item(13), item(16)]), e => e.code === 'invalid-argument');
    console.log('CURRICULUM_REVIEW_BACKEND PASS: owner, tenant, 34 mappings, source guards, atomic batch, idempotency, immutable history and audit');
  } finally {
    for (const collection of ['curriculumProposalReviews', 'curriculumReviewRequests', 'audit_logs', 'classes', 'academicYears', 'users']) {
      const docs = await db.collection(collection).get();
      for (const d of docs.docs) if (d.id.startsWith(schoolId) || d.data().schoolId === schoolId) await db.recursiveDelete(d.ref);
    }
    await admin.app().delete();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
