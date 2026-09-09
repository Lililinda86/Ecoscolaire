const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
const admin = require('../../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: 'demo-ecoscolaire' });
const { reviewCurriculumSubjectMappings: fn } = require('../../functions/lib/pedagogy/subjectMapping');
const db = admin.firestore(), schoolId = 'subject-review-' + randomBytes(8).toString('hex'), year = schoolId + '-year';
const ctx = role => ({ auth: { uid: schoolId + '-' + role, token: {} } });
const call = (action, role = 'owner', extra = {}) => fn.run({ schoolId, academicYearId: year, action, ...extra }, ctx(role));
(async () => {
  try {
    await db.doc('academicYears/' + year).create({ schoolId, status: 'active' });
    for (const role of ['owner', 'secretary', 'foreign']) await db.doc('users/' + schoolId + '-' + role).create({ schoolId: role === 'foreign' ? schoolId + '-foreign' : schoolId, role: role === 'foreign' ? 'owner' : role, isActive: true });
    for (const level of ['fr-primary-sil', 'fr-primary-cp', 'fr-primary-ce1', 'fr-primary-ce2', 'fr-primary-cm1', 'fr-primary-cm2', ...Array.from({length: 6}, (_, i) => 'en-primary-' + (i + 1))]) await db.doc('classes/' + schoolId + '-' + level).create({ schoolId, name: level, catalogLevelId: level, isActive: true });
    for (const [id, name] of [['math', 'Mathématiques'], ['ang', 'Anglais'], ['history', 'Histoire'], ['arts', 'Arts et culture']]) await db.doc('subjects/' + schoolId + '-' + id).create({ schoolId, name, section: 'francophone', cycles: ['primary'], isActive: true });
    const preview = await call('preview'); assert.equal(preview.rows.length, 12);
    const row = preview.rows.find(r => r.catalogLevelId === 'fr-primary-sil');
    assert.equal(row.safeCount, 2); assert.equal(row.ambiguousCount, 2);
    assert.equal((await call('preview', 'secretary')).rows.length, 12);
    await assert.rejects(call('preview', 'foreign'), e => e.code === 'permission-denied');
    const payload = { classId: row.classId, expectedVersion: row.mappingVersion, confirmed: true };
    await assert.rejects(call('apply', 'secretary', payload), e => e.code === 'permission-denied');
    await assert.rejects(call('apply', 'owner', { ...payload, confirmed: false }), e => e.code === 'invalid-argument');
    await assert.rejects(call('apply', 'owner', { ...payload, expectedVersion: 'stale' }), e => e.code === 'aborted');
    const applied = await call('apply', 'owner', payload);
    assert.equal(applied.status, 'proposed');
    assert.equal((await call('apply', 'owner', payload)).idempotent, true);
    const stored = (await db.doc('curriculumSubjectMappings/' + applied.id).get()).data();
    assert.equal(stored.links.length, 2); assert(stored.links.every(l => ['EXACT', 'SAFE_ALIAS'].includes(l.matchStatus)));
    assert.equal(stored.adoptionChanged, false); assert.equal(stored.classProgramPublished, false);
    assert(stored.appliedAt.toMillis()); assert.equal(stored.appliedBy, schoolId + '-owner');
    assert.equal((await db.collection('audit_logs').where('schoolId', '==', schoolId).get()).size, 1);
    for (const collection of ['classSubjects', 'classPrograms', 'teacherAssignments', 'schoolCurriculumAdoptions', 'curriculumProposalReviews']) assert.equal((await db.collection(collection).where('schoolId', '==', schoolId).get()).size, 0);
    await db.doc('subjects/' + schoolId + '-duplicate').create({ schoolId, name: 'Anglais', section: 'francophone', cycles: ['primary'], isActive: true });
    await assert.rejects(call('apply', 'owner', payload), e => e.code === 'aborted');
    assert.equal((await db.doc('curriculumSubjectMappings/' + applied.id).get()).data().links.length, 2);
    console.log('SUBJECT_MAPPING_BACKEND PASS: twelve primary classes, owner, tenant, safe only, confirmation, idempotence, version guards, immutable old proposal, audit, no adoption');
  } finally {
    for (const collection of ['curriculumSubjectMappings', 'audit_logs', 'classes', 'academicYears', 'subjects', 'users']) {
      const docs = await db.collection(collection).get();
      for (const d of docs.docs) if (d.id.startsWith(schoolId) || d.data().schoolId === schoolId) await db.recursiveDelete(d.ref);
    }
    await admin.app().delete();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
