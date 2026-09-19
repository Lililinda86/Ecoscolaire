import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';

export const stable = value => value?.toJSON ? stable(value.toJSON()) : Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])) : value;
export const digest = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
export const actor = 'delegated-validation-workflow';
const collections = new Set(['curriculumPrograms','curriculumUnits','schoolCurriculumAdoptions','curriculumSubjectMappings']);
export const scopeHash = docs => digest(docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.id.localeCompare(b.id)));

/** IAM-only operator library. No endpoint or owner impersonation. Creates only;
 * each independent group is atomic, including audit and immutable history.
 * The runner pins the reviewed manifest and authorization digests in code.
 */
export async function runValidationGroup(db, policy, manifest, group, mode, drySnapshot) {
  assert(['ecoscolaire-staging','demo-ecoscolaire'].includes(policy.projectId),'Staging only');
  assert(policy.projectId!=='demo-ecoscolaire'||process.env.FIRESTORE_EMULATOR_HOST,'Emulator required');
  assert.equal(db.projectId,policy.projectId); assert.equal(db.databaseId,'(default)');
  assert(['dry-run','apply'].includes(mode));
  assert.equal(digest(manifest),policy.manifestDigest,'Unreviewed manifest');
  assert.equal(manifest.authorizationReference,policy.authorizationReference);
  assert.equal(manifest.projectId,policy.projectId);
  assert(manifest.groups.some(g=>digest(g)===digest(group)),'Unknown group');
  assert(group.writes.length>0&&group.writes.length<=100,'Bounded group required');
  const {schoolId,academicYearId,authorizationReference}=manifest;
  for(const id of [schoolId,academicYearId,group.id]) assert(/^[a-zA-Z0-9_-]{1,100}$/.test(id));
  const paths=group.writes.map(w=>w.path);
  const allWritePaths=new Set(manifest.groups.flatMap(g=>g.writes.map(w=>w.path)));
  const sourceDocuments=manifest.sourceDocuments||{};
  for(const path of Object.keys(sourceDocuments)) assert(/^curriculumPrograms\/[a-zA-Z0-9_-]+$/.test(path),'Invalid source dependency');
  assert.equal(new Set(paths).size,paths.length);
  for(const w of group.writes) {
    const [collection,id,...rest]=w.path.split('/');
    assert(collections.has(collection)&&/^[a-zA-Z0-9_-]{1,180}$/.test(id)&&!rest.length,'Forbidden write target');
    assert.equal(w.data.decisionOrigin,'OWNER_DELEGATED_VALIDATION');
    assert.equal(w.data.decisionAuthorizedBy,'owner'); assert.equal(w.data.decisionRecordedBy,actor);
    assert.equal(w.data.authorizationReference,authorizationReference);
    assert.equal(w.data.decisionBatchId,group.id);
    assert(w.data.sourceVersion&&w.data.mappingVersion&&w.data.reason&&w.data.evidence,'Traceability required');
    assert.equal(w.data.revision,1);
    if(['schoolCurriculumAdoptions','curriculumSubjectMappings'].includes(collection)) {
      assert.equal(w.data.schoolId,schoolId); assert.equal(w.data.academicYearId,academicYearId);
    }
    assert(!('coefficient' in w.data)&&!('weeklyHours' in w.data),'No invented timetable or coefficient');
    if(collection==='curriculumPrograms'&&w.data.sourceType==='local') assert.equal(w.data.authority,'ITALO');
    if(collection==='schoolCurriculumAdoptions') assert.equal(w.data.programKind,'ITALO_EARLY_YEARS_PROGRAM','No official adoption authorized by this runner');
  }
  return db.runTransaction(async tx=>{
    const schoolRef=db.doc('schools/'+schoolId), yearRef=db.doc('academicYears/'+academicYearId);
    const [school,year,...guards]=await Promise.all([tx.get(schoolRef),tx.get(yearRef),...Object.keys(manifest.guardHashes).map(c=>tx.get(db.collection(c).where('schoolId','==',schoolId).limit(2001)))]);
    assert(school.exists&&school.data().activeAcademicYearId===academicYearId&&school.data().isActive!==false,'School/year changed');
    assert(year.data()?.schoolId===schoolId&&year.data()?.status==='active'&&year.data()?.isActive!==false&&year.data()?.active!==false,'Foreign/inactive year');
    Object.keys(manifest.guardHashes).forEach((c,i)=>{assert(guards[i].size<=2000);assert.equal(scopeHash(guards[i].docs.filter(d=>!allWritePaths.has(c+'/'+d.id))),manifest.guardHashes[c],c+' changed since reviewed dry run');});
    for(const [path,expected] of Object.entries(sourceDocuments)) { const source=await tx.get(db.doc(path)); assert(source.exists); assert.equal(digest({id:source.id,...source.data()}),expected,'Source catalogue version changed'); }
    const receiptRef=db.doc('curriculumReviewRequests/'+digest(['delegated-validation-v1',schoolId,academicYearId,group.id]));
    const receipt=await tx.get(receiptRef);
    const rows=await Promise.all(group.writes.map(async w=>{
      const ref=db.doc(w.path), history=ref.collection(w.path.startsWith('schoolCurriculumAdoptions/')?'versions':'history').doc('1');
      const audit=db.doc('audit_logs/'+digest([group.id,w.path]));
      const [previous,oldHistory,oldAudit]=await Promise.all([tx.get(ref),tx.get(history),tx.get(audit)]);
      const expected={...w.data,validationContentHash:digest(w.data)};
      if(receipt.exists) {
        assert.equal(receipt.data().manifestDigest,policy.manifestDigest,'Receipt conflict');
        assert.equal(receipt.data().status,'CONSUMED');
        for(const existing of [previous,oldHistory]) {
          assert(existing.exists&&existing.data().decidedAt,'Missing persisted decision/history');
          for(const [k,v] of Object.entries(expected)) assert.equal(digest(existing.data()[k]),digest(v),'Changed decision '+w.path+'/'+k);
        }
        assert.equal(oldAudit.data()?.details?.validationContentHash,expected.validationContentHash,'Missing audit');
        assert.equal(oldAudit.data()?.actorUid,actor); assert.equal(oldAudit.data()?.actorRole,'system');
      } else assert(!previous.exists&&!oldHistory.exists&&!oldAudit.exists,'Existing decision/content conflict: '+w.path);
      return {ref,history,audit,expected};
    }));
    const snapshot=digest([policy.manifestDigest,group.id,school.updateTime?.toMillis(),year.updateTime?.toMillis(),manifest.guardHashes,receipt.exists]);
    const result={group:group.id,kind:group.kind,expected:rows.length,created:0,persisted:receipt.exists?rows.length:0,idempotent:receipt.exists,snapshot};
    if(mode==='dry-run'||receipt.exists) return result;
    assert.equal(snapshot,drySnapshot,'Fresh matching dry run required');
    for(const row of rows) {
      const record={...row.expected,decidedAt:FieldValue.serverTimestamp()};
      tx.create(row.ref,record); tx.create(row.history,record);
      tx.create(row.audit,{schoolId,actorUid:actor,actorRole:'system',action:'DELEGATED_PEDAGOGICAL_VALIDATION',targetType:row.ref.parent.id,targetId:row.ref.id,canonicalBackendAudit:true,timestamp:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp(),details:{academicYearId,decisionBatchId:group.id,decisionOrigin:'OWNER_DELEGATED_VALIDATION',decisionAuthorizedBy:'owner',decisionRecordedBy:actor,authorizationReference,validationContentHash:record.validationContentHash,sourceVersion:record.sourceVersion,mappingVersion:record.mappingVersion,decision:record.decision}});
    }
    tx.create(receiptRef,{schoolId,academicYearId,decisionBatchId:group.id,status:'CONSUMED',manifestDigest:policy.manifestDigest,authorizationReference,actorUid:actor,recordedAt:FieldValue.serverTimestamp()});
    return {...result,created:rows.length,persisted:rows.length};
  });
}
