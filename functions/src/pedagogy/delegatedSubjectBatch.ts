import { Firestore, FieldValue, DocumentData } from 'firebase-admin/firestore';
import { batchDigest, BatchPolicy, LevelManifestEntry } from './delegatedLevelBatch';
import { curriculumReviewProposals } from './curriculumReviewManifest';
import { matchOfficialSubjects, primaryDocumentByLevel, documentaryRelationsFor, MappingSubject } from './subjectMappingEngine';
import { subjectMappingSources } from './subjectMappingSources';
import { documentaryEvidenceSnapshot } from './documentaryEvidence';

const ensure = (ok: unknown, message: string): void => { if (!ok) throw Error(message); };
const active = (d: DocumentData) => d.isActive !== false && d.active !== false && !['inactive', 'archived'].includes(d.status);
const fields = ['decisionBatchId', 'schoolId', 'academicYearId', 'decisionType', 'targetId', 'decision', 'sourceVersion', 'mappingVersion', 'authorizationReference', 'reason'];
const stamp = (d: { updateTime?: { seconds: number; nanoseconds: number } }) => d.updateTime ? [d.updateTime.seconds, d.updateTime.nanoseconds] : null;

/** Trusted source-only reconstruction. No fuzzy equivalence, local organization,
 * teacher choice, adoption, schedule or real teaching is inferred here. */
export function buildPrimaryDocumentaryTargets(schoolId: string, academicYearId: string, classes: (DocumentData & { id: string })[], catalog: MappingSubject[]) {
  return classes.flatMap(cls => {
    if (!active(cls) || cls.schoolId !== schoolId || cls.academicYearId && cls.academicYearId !== academicYearId) return [];
    const source = subjectMappingSources.find(s => s.documentId === primaryDocumentByLevel[cls.catalogLevelId]);
    if (!source) return [];
    ensure((cls.section || cls.type) === source.section && (!cls.cycle || cls.cycle === 'primary') && cls.educationType !== 'technical', 'Primary subsystem mismatch');
    ensure(new URL(source.sourceUrl).hostname === 'www.minedub.cm' && source.sourceUrl.startsWith('https://') && /^[a-f0-9]{64}$/.test(source.sourceVersion), 'Authenticated source contract required');
    const mappings = matchOfficialSubjects(source.names, catalog, schoolId, source.section as 'francophone' | 'anglophone').map(m => ({ ...m, documentaryRelations: documentaryRelationsFor(cls.catalogLevelId, m) }));
    const mappingVersion = batchDigest(['subject-mapping-v1', source.sourceVersion, cls.id, cls.catalogLevelId, mappings]);
    return mappings.flatMap(m => m.documentaryRelations.filter(r => ['EXACT', 'SAFE_ALIAS', 'COMPONENT_OF_OFFICIAL_DOMAIN'].includes(r.type)).map(relation => {
      const component = relation.type === 'COMPONENT_OF_OFFICIAL_DOMAIN';
      ensure(component || !!m.localMatch && m.candidates.length === 1 && ['EXACT', 'SAFE_ALIAS'].includes(m.status), 'Unsafe mapping excluded');
      const parts = [schoolId, academicYearId, cls.id, source.sourceVersion, mappingVersion, m.officialSubject];
      return { id: batchDigest(component ? ['documentary-component-edge-v1', ...parts, relation.subjectId] : ['owner-subject-review-v1', ...parts]),
        groupId: batchDigest([component ? 'documentary-components-v1' : 'owner-subject-review-v1', ...parts]),
        classId: cls.id, catalogLevelId: String(cls.catalogLevelId), officialSubject: m.officialSubject,
        subjectId: relation.subjectId, relation, evidenceRelations: component ? m.documentaryRelations.filter(r => r.type === 'COMPONENT_OF_OFFICIAL_DOMAIN') : m.documentaryRelations,
        sourceVersion: source.sourceVersion, mappingVersion, sourceDocumentId: source.documentId, matchStatus: m.status,
        decisionType: component ? 'DOCUMENTARILY_RESOLVED_PRIMARY_MAPPINGS' : 'VERIFIED_SAFE_PRIMARY_MAPPINGS', decision: component ? 'COMPONENT_OF_OFFICIAL_DOMAIN' : 'APPROVED', component };
    }));
  });
}

/** IAM admin library only; the sole executable pins one private authorization.
 * No export from Functions index, no owner impersonation and no RBAC relaxation. */
export async function runDelegatedSubjectBatch(db: Firestore, policy: BatchPolicy, manifest: LevelManifestEntry[], mode: 'dry-run' | 'apply', expectedSnapshot?: string) {
  ensure(policy.projectId === 'ecoscolaire-staging' || policy.projectId === 'demo-ecoscolaire' && !!process.env.FIRESTORE_EMULATOR_HOST, 'Staging or isolated emulator required');
  ensure((db as Firestore & { readonly projectId: string }).projectId === policy.projectId && db.databaseId === '(default)', 'Database mismatch');
  ensure(['dry-run', 'apply'].includes(mode) && Array.isArray(manifest) && manifest.length === 94 && batchDigest(manifest) === policy.manifestDigest, 'Unapproved exact manifest');
  const { schoolId, academicYearId, decisionBatchId } = manifest[0];
  for (const item of manifest) {
    ensure(Object.keys(item).length === fields.length && fields.every(k => Object.hasOwn(item, k)) && Object.values(item).every(v => typeof v === 'string' && v.length > 0 && v.length <= 2000), 'Invalid manifest fields');
    ensure(item.schoolId === schoolId && item.academicYearId === academicYearId && item.decisionBatchId === decisionBatchId && item.authorizationReference === policy.authorizationReference, 'Authorization scope mismatch');
    ensure([item.schoolId, item.academicYearId, item.decisionBatchId, item.targetId].every(v => v.length <= 100 && !v.includes('/')), 'Invalid identifier');
  }
  ensure(new Set(manifest.map(m => m.targetId)).size === 94, 'Duplicate relation');
  const receiptRef = db.collection('curriculumReviewRequests').doc(batchDigest(['delegated-subject-batch-v1', decisionBatchId]));
  return db.runTransaction(async tx => {
    const [school, year, receipt, classSnap, catalogSnap, prior] = await Promise.all([
      tx.get(db.doc('schools/' + schoolId)), tx.get(db.doc('academicYears/' + academicYearId)), tx.get(receiptRef),
      tx.get(db.collection('classes').where('schoolId', '==', schoolId).limit(501)), tx.get(db.collection('subjects').where('schoolId', '==', schoolId).limit(1001)),
      tx.get(db.collection('curriculumSubjectMappings').where('schoolId', '==', schoolId).limit(2001)),
    ]);
    ensure(school.exists && active(school.data()!) && school.data()?.activeAcademicYearId === academicYearId && year.data()?.schoolId === schoolId && year.data()?.status === 'active' && active(year.data()!), 'Current tenant/year mismatch');
    ensure(classSnap.size <= 500 && catalogSnap.size <= 1000 && prior.size <= 2000, 'Bounded snapshot exceeded');
    const classes: (DocumentData & { id: string })[] = classSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    const catalog = catalogSnap.docs.map(doc => { const d = doc.data(); return { id: doc.id, schoolId: d.schoolId, name: d.name, section: d.section, cycles: d.cycles, isActive: active(d), localConfigurationStatus: d.localConfigurationStatus || '' } as MappingSubject; }).filter(d => typeof d.name === 'string');
    const targets = buildPrimaryDocumentaryTargets(schoolId, academicYearId, classes, catalog);
    ensure(targets.filter(t => !t.component).length === 76 && targets.filter(t => t.component).length === 18, 'Verified mapping cohort changed; review required');
    const classIds = [...new Set(targets.map(t => t.classId))]; ensure(classIds.length === 12, 'Twelve primary classes required');
    const levels = await Promise.all(classIds.map(async id => {
      const cls = classes.find(c => c.id === id)!;
      const p = curriculumReviewProposals.find(p => p.catalogLevelId === cls.catalogLevelId && p.highConfidence); ensure(p, 'Primary level proposal absent');
      const review = await tx.get(db.collection('curriculumProposalReviews').doc(batchDigest([schoolId, academicYearId, id, p!.sourceVersion, p!.mappingVersion])));
      ensure(review.data()?.decision === 'APPROVED' && review.data()?.schoolId === schoolId && review.data()?.academicYearId === academicYearId, 'Explicit level approval required'); return review;
    }));
    const selected = manifest.map(item => {
      const target = targets.find(t => t.id === item.targetId);
      ensure(target && target.sourceVersion === item.sourceVersion && target.mappingVersion === item.mappingVersion && target.decision === item.decision && target.decisionType === item.decisionType, 'Target/source/version/decision conflict');
      return { ...target!, reason: item.reason };
    });
    const grouped = [...new Set(selected.map(t => t.groupId))].map(id => selected.filter(t => t.groupId === id));
    ensure(grouped.length === 86, 'Expected 76 safe records and 10 multi-component domains');
    const rows = await Promise.all(grouped.map(async group => {
      const first = group[0], ref = db.collection('curriculumSubjectMappings').doc(first.groupId), historyRef = ref.collection('history').doc('1');
      const auditRef = db.collection('audit_logs').doc(batchDigest(['delegated-subject-audit-v1', decisionBatchId, first.groupId]));
      const [history, audit] = await Promise.all([tx.get(historyRef), tx.get(auditRef)]);
      const previous = prior.docs.find(d => d.id === first.groupId);
      const evidence = documentaryEvidenceSnapshot(first.evidenceRelations, first.sourceVersion, first.mappingVersion);
      const expected = { schoolId, academicYearId, classId: first.classId, catalogLevelId: first.catalogLevelId, officialSubject: first.officialSubject, sourceVersion: first.sourceVersion, mappingVersion: first.mappingVersion, sourceDocumentId: first.sourceDocumentId, decisionBatchId, authorizationReference: policy.authorizationReference, decisionOrigin: 'OWNER_EXPLICIT_DELEGATED_DECISION', decisionAuthorizedByRole: 'owner', decidedBy: 'system/delegated-workflow', decisionRecordedBy: 'system/delegated-workflow', revision: 1, decisionNote: first.reason, adoptionChanged: false, classProgramPublished: false,
        scope: first.component ? 'DOCUMENTARY_COMPONENT_RELATIONS' : 'OWNER_DOCUMENTARY_SUBJECT_DECISION', decision: first.component ? 'DOCUMENTARILY_VERIFIED' : 'APPROVED', ...(!first.component ? { subjectId: first.subjectId, matchStatus: first.matchStatus } : {}) };
      if (receipt.exists) {
        ensure(receipt.data()?.manifestDigest === policy.manifestDigest && receipt.data()?.status === 'CONSUMED', 'Receipt conflict');
        for (const d of [previous?.data(), history.data()]) {
          ensure(d && Object.entries(expected).every(([k, v]) => d[k] === v) && d.documentaryEvidence?.snapshotVersion === evidence.snapshotVersion && !!d.decidedAt, 'Recorded relation changed; no replay');
          ensure(documentaryEvidenceSnapshot(d!.documentaryEvidence.relations, first.sourceVersion, first.mappingVersion).snapshotVersion === evidence.snapshotVersion && documentaryEvidenceSnapshot(first.component ? d!.relations : [d!.documentaryRelation], first.sourceVersion, first.mappingVersion).snapshotVersion === evidence.snapshotVersion, 'Stored relation evidence conflict');
        }
        ensure(audit.data()?.actorRole === 'system' && audit.data()?.details?.decisionBatchId === decisionBatchId && audit.data()?.details?.documentaryEvidenceVersion === evidence.snapshotVersion, 'Audit conflict');
      } else ensure(!previous && !history.exists && !audit.exists, 'Concurrent decision; no partial write');
      return { first, group, ref, historyRef, auditRef, expected, evidence };
    }));
    const snapshot = batchDigest([policy.manifestDigest, stamp(school), stamp(year), classSnap.docs.map(d => [d.id, stamp(d)]), catalogSnap.docs.map(d => [d.id, stamp(d)]), levels.map(d => [d.id, stamp(d)]), receipt.exists]);
    const result = { expected: 94, matched: 94, conflicts: 0, safeMappings: 76, componentRelations: 18, componentDomains: 10, records: 86, applied: 0, persisted: receipt.exists ? 94 : 0, idempotent: receipt.exists, snapshot, manifestDigest: policy.manifestDigest };
    if (mode === 'dry-run' || receipt.exists) return result;
    ensure(snapshot === expectedSnapshot, 'Fresh matching dry run required');
    for (const row of rows) {
      const record = { ...row.expected, decidedAt: FieldValue.serverTimestamp(), documentaryEvidence: row.evidence,
        ...(row.first.component ? { relations: row.evidence.relations } : { subjectId: row.first.subjectId, matchStatus: row.first.matchStatus, documentaryRelation: row.first.relation }) };
      tx.create(row.ref, record); tx.create(row.historyRef, record);
      tx.create(row.auditRef, { schoolId, action: row.first.component ? 'CURRICULUM_DOCUMENTARY_COMPONENTS_RECORDED' : 'CURRICULUM_SUBJECT_MAPPING_DECIDED', actorUid: 'system/delegated-workflow', actorRole: 'system', targetType: 'curriculumSubjectMapping', targetId: row.ref.id, timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), canonicalBackendAudit: true, details: { academicYearId, classId: row.first.classId, decision: row.expected.decision, revision: 1, sourceVersion: row.first.sourceVersion, mappingVersion: row.first.mappingVersion, decisionBatchId, authorizationReference: policy.authorizationReference, decisionOrigin: row.expected.decisionOrigin, decisionAuthorizedByRole: 'owner', decisionRecordedBy: row.expected.decisionRecordedBy, documentaryEvidenceVersion: row.evidence.snapshotVersion, relationCount: row.group.length } });
    }
    tx.create(receiptRef, { schoolId, academicYearId, decisionBatchId, manifestDigest: policy.manifestDigest, authorizationReference: policy.authorizationReference, status: 'CONSUMED', recordedAt: FieldValue.serverTimestamp(), actorUid: 'system/delegated-workflow' });
    return { ...result, applied: 94, persisted: 94 };
  });
}
