const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Emulator required');
const admin = require('../../functions/node_modules/firebase-admin');
const { runDelegatedLevelBatch: run, batchDigest } = require('../../functions/lib/pedagogy/delegatedLevelBatch');
const { curriculumReviewProposals } = require('../../functions/lib/pedagogy/curriculumReviewManifest');
admin.initializeApp({ projectId: 'demo-ecoscolaire' });
const db = admin.firestore(), schoolId = 'delegated-test-' + randomBytes(8).toString('hex'), year = schoolId + '-year';
const proposals = curriculumReviewProposals.filter(p => p.highConfidence);
const authorizationReference = 'synthetic-authorization-only';
const manifest = proposals.map(p => ({ decisionBatchId: schoolId + '-batch', schoolId, academicYearId: year, decisionType: 'PRIMARY_LEVEL_ATTACHMENT_ONLY', targetId: schoolId + '-' + p.id, decision: 'APPROVED', sourceVersion: p.sourceVersion, mappingVersion: p.mappingVersion, authorizationReference, reason: 'Synthetic owner explicitly approved documentary level only' }));
const policy = { projectId: 'demo-ecoscolaire', authorizationReference, manifestDigest: batchDigest(manifest) };
const withTestPolicy = (m, mode = 'dry-run', snapshot) => run(db, { ...policy, manifestDigest: batchDigest(m) }, m, mode, snapshot);
const targetRef = i => db.collection('curriculumProposalReviews').doc(batchDigest([schoolId, year, manifest[i].targetId, manifest[i].sourceVersion, manifest[i].mappingVersion]));
const count = async col => (await db.collection(col).where('schoolId', '==', schoolId).get()).size;
(async () => {
  try {
    await db.doc('schools/' + schoolId).create({ activeAcademicYearId: year });
    await db.doc('academicYears/' + year).create({ schoolId, status: 'active', isActive: true });
    for (const p of proposals) await db.doc('classes/' + schoolId + '-' + p.id).create({ schoolId, catalogLevelId: p.catalogLevelId, academicYearId: year, section: p.catalogLevelId.startsWith('fr-') ? 'francophone' : 'anglophone', cycle: 'primary', isActive: true });
    const dry = await run(db, policy, manifest, 'dry-run');
    assert.equal(dry.matched, 12); assert.equal(dry.applied, 0);
    for (const col of ['curriculumProposalReviews', 'curriculumReviewRequests', 'audit_logs']) assert.equal(await count(col), 0, 'dry run writes nothing');
    await assert.rejects(run(db, { ...policy, projectId: 'forbidden-live-project' }, manifest, 'dry-run'), /Staging only/);
    await assert.rejects(run(db, { ...policy, projectId: 'ecoscolaire-staging' }, manifest, 'dry-run'), /Database project mismatch/);
    await assert.rejects(run(db, policy, manifest.map((i, n) => n ? i : { ...i, decision: 'NOT_APPLICABLE' }), 'apply', dry.snapshot), /Unapproved manifest/);
    await assert.rejects(withTestPolicy(manifest.map(i => ({ ...i, role: 'owner' }))), /fields not allowed/);
    await assert.rejects(withTestPolicy(manifest.map(i => ({ ...i, authorizationReference: 'forged' }))), /not explicitly authorized/);
    await assert.rejects(withTestPolicy(manifest.map(i => ({ ...i, decisionType: 'VERIFIED_SAFE_PRIMARY_MAPPINGS' }))), /not explicitly authorized/);
    await assert.rejects(withTestPolicy(manifest.slice(1)), /Exactly twelve/);
    await assert.rejects(withTestPolicy([manifest[1], ...manifest.slice(1)]), /Duplicate target/);
    for (const field of ['sourceVersion', 'mappingVersion']) await assert.rejects(withTestPolicy(manifest.map((i, n) => n ? i : { ...i, [field]: 'stale' })), /Version mismatch/);
    await assert.rejects(withTestPolicy(manifest.map(i => ({ ...i, schoolId: schoolId + '-foreign' }))), /school\/year mismatch/);
    await assert.rejects(withTestPolicy(manifest.map(i => ({ ...i, academicYearId: year + '-foreign' }))), /school\/year mismatch/);
    const cls = db.doc('classes/' + manifest[0].targetId);
    await cls.update({ schoolId: 'foreign' });
    await assert.rejects(run(db, policy, manifest, 'apply', dry.snapshot), /roster changed/);
    await cls.update({ schoolId });
    await cls.update({ section: 'anglophone' });
    await assert.rejects(run(db, policy, manifest, 'dry-run'), /Subsystem mismatch/);
    await cls.update({ section: 'francophone' });
    await assert.rejects(run(db, policy, manifest, 'apply', dry.snapshot), /state changed/);
    await assert.rejects(run(db, policy, manifest, 'apply'), /dry run required/);
    await targetRef(11).create({ schoolId, decision: 'REQUEST_CHANGE' });
    await assert.rejects(run(db, policy, manifest, 'dry-run'), /Concurrent decision/);
    assert.equal(await count('curriculumProposalReviews'), 1, 'one conflict blocks eleven other writes');
    await targetRef(11).delete(); // Exact synthetic emulator conflict only.
    const fresh = await run(db, policy, manifest, 'dry-run');
    const applied = await run(db, policy, manifest, 'apply', fresh.snapshot);
    assert.equal(applied.applied, 12);
    const reload = await run(db, policy, manifest, 'dry-run');
    assert.equal(reload.persisted, 12);
    const retry = await run(db, policy, manifest, 'apply', fresh.snapshot);
    assert.equal(retry.applied, 0); assert.equal(retry.idempotent, true);
    assert.equal(await count('curriculumReviewRequests'), 1); assert.equal(await count('audit_logs'), 12);
    for (let i = 0; i < 12; i++) {
      const d = (await targetRef(i).get()).data();
      assert.equal(d.decisionOrigin, 'OWNER_EXPLICIT_DELEGATED_DECISION');
      assert.equal(d.decidedBy, 'system/delegated-workflow'); assert.equal(d.decisionRecordedBy, d.decidedBy);
      assert.equal(d.decisionAuthorizedByRole, 'owner'); assert.equal(d.authorizationReference, authorizationReference);
      assert.equal(d.adoptionChanged, false); assert.equal(d.sourceAuthenticationChanged, false);
      assert.equal(d.scope, 'DOCUMENTARY_CLASS_MAPPING_ONLY'); assert.ok(d.decidedAt.toMillis());
      assert.equal((await targetRef(i).collection('history').get()).size, 1);
    }
    for (const a of (await db.collection('audit_logs').where('schoolId', '==', schoolId).get()).docs) {
      assert.equal(a.data().actorRole, 'system'); assert.equal(a.data().details.decisionAuthorizedByRole, 'owner');
    }
    const collision = manifest.map(i => ({ ...i, reason: 'Changed content with same batch ID' }));
    await assert.rejects(withTestPolicy(collision), /receipt conflict/);
    await targetRef(0).update({ decision: 'REQUEST_CHANGE', revision: 2 });
    await assert.rejects(run(db, policy, manifest, 'apply', reload.snapshot), /decision changed/);
    assert.equal(await count('audit_logs'), 12, 'no replay after newer decision');
    for (const c of ['users', 'teacherAssignments', 'curriculumSubjectMappings', 'schoolCurriculumAdoptions', 'classPrograms', 'timetableEntries', 'teachingPlans']) assert.equal(await count(c), 0);
    console.log('DELEGATED_LEVEL_BATCH PASS: twelve, no-write dry run, pinned authorization, atomicity, versions, tenant/year, conflicts, retry, consumed receipt, attribution, audit, no impersonation or teaching changes');
  } finally {
    for (const c of ['curriculumProposalReviews', 'curriculumReviewRequests', 'audit_logs', 'classes', 'academicYears']) for (const d of (await db.collection(c).where('schoolId', '==', schoolId).get()).docs) await db.recursiveDelete(d.ref);
    await db.doc('schools/' + schoolId).delete(); await admin.app().delete();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
