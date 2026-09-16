import { createHash } from 'node:crypto';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { curriculumReviewProposals } from './curriculumReviewManifest';

/** Admin-library only. NOT exported from index.ts and never callable over HTTP.
 * Authorization is a server/operator-owned digest, never a caller-supplied role.
 * The executable pins the single owner's authorization; tests use synthetic policy.
 */
export interface LevelManifestEntry {
  decisionBatchId: string; schoolId: string; academicYearId: string;
  decisionType: string; targetId: string; decision: string;
  sourceVersion: string; mappingVersion: string; authorizationReference: string; reason: string;
}
export interface BatchPolicy { projectId: string; manifestDigest: string; authorizationReference: string }
export const batchDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields = ['decisionBatchId', 'schoolId', 'academicYearId', 'decisionType', 'targetId', 'decision', 'sourceVersion', 'mappingVersion', 'authorizationReference', 'reason'];
const levels = ['fr-primary-sil', 'fr-primary-cp', 'fr-primary-ce1', 'fr-primary-ce2', 'fr-primary-cm1', 'fr-primary-cm2', 'en-primary-1', 'en-primary-2', 'en-primary-3', 'en-primary-4', 'en-primary-5', 'en-primary-6'];
const active = (d: FirebaseFirestore.DocumentData) => d.isActive !== false && d.active !== false && !['inactive', 'archived'].includes(d.status);
const ensure = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const timestampVersion = (value?: { seconds: number; nanoseconds: number }) => value ? [value.seconds, value.nanoseconds] : null;

export async function runDelegatedLevelBatch(db: Firestore, policy: BatchPolicy, manifest: LevelManifestEntry[], mode: 'dry-run' | 'apply', dryRunSnapshot?: string) {
  ensure(['ecoscolaire-staging', 'demo-ecoscolaire'].includes(policy.projectId), 'Staging only');
  ensure(policy.projectId !== 'demo-ecoscolaire' || !!process.env.FIRESTORE_EMULATOR_HOST, 'Emulator required');
  // The installed Firestore SDK has this runtime getter but omits it from its
  // public declaration. Fail closed if it ever disappears; never infer project.
  ensure((db as Firestore & { readonly projectId: string }).projectId === policy.projectId, 'Database project mismatch');
  ensure(db.databaseId === '(default)', 'Default database required');
  ensure(mode === 'dry-run' || mode === 'apply', 'Unsupported mode');
  ensure(Array.isArray(manifest) && manifest.length === 12, 'Exactly twelve authorized levels required');
  ensure(batchDigest(manifest) === policy.manifestDigest, 'Unapproved manifest digest');
  const first = manifest[0];
  for (const item of manifest) {
    ensure(Object.keys(item).length === fields.length && fields.every(k => Object.hasOwn(item, k)), 'Manifest fields not allowed');
    ensure(Object.values(item).every(v => typeof v === 'string' && v.length > 0 && v.length <= 2000), 'Invalid manifest value');
    for (const id of [item.schoolId, item.academicYearId, item.targetId, item.decisionBatchId]) ensure(id.length <= 100 && !id.includes('/'), 'Invalid identifier');
    ensure(item.schoolId === first.schoolId && item.academicYearId === first.academicYearId && item.decisionBatchId === first.decisionBatchId, 'Mixed batch scope');
    ensure(item.authorizationReference === policy.authorizationReference && item.decisionType === 'PRIMARY_LEVEL_ATTACHMENT_ONLY' && item.decision === 'APPROVED', 'Decision not explicitly authorized');
  }
  ensure(new Set(manifest.map(i => i.targetId)).size === 12, 'Duplicate target');
  const { schoolId, academicYearId, decisionBatchId } = first;
  const receiptRef = db.collection('curriculumReviewRequests').doc(batchDigest(['delegated-level-batch-v1', decisionBatchId]));
  return db.runTransaction(async tx => {
    const [school, year, receipt, roster] = await Promise.all([
      tx.get(db.doc('schools/' + schoolId)), tx.get(db.doc('academicYears/' + academicYearId)), tx.get(receiptRef),
      tx.get(db.collection('classes').where('schoolId', '==', schoolId).limit(501)),
    ]);
    ensure(school.exists && active(school.data()!) && school.data()?.activeAcademicYearId === academicYearId, 'Current school/year mismatch');
    ensure(year.data()?.schoolId === schoolId && year.data()?.status === 'active' && active(year.data()!), 'Inactive or foreign year');
    ensure(roster.size <= 500, 'Class limit exceeded');
    const primary = roster.docs.filter(d => active(d.data()) && levels.includes(d.data().catalogLevelId) && (!d.data().academicYearId || d.data().academicYearId === academicYearId));
    ensure(primary.length === 12 && new Set(primary.map(d => d.data().catalogLevelId)).size === 12, 'Primary roster changed');
    const rows = await Promise.all(manifest.map(async item => {
      const classroom = primary.find(d => d.id === item.targetId), cls = classroom?.data();
      ensure(cls && cls.schoolId === schoolId, 'Wrong tenant or inactive target');
      const p = curriculumReviewProposals.find(p => p.catalogLevelId === cls!.catalogLevelId);
      ensure(p?.highConfidence && !p.missingSource && p.sources.length && levels.includes(p.catalogLevelId), 'Unauthorized proposal');
      ensure(p!.sourceVersion === item.sourceVersion && p!.mappingVersion === item.mappingVersion, 'Version mismatch');
      const section = p!.catalogLevelId.startsWith('fr-') ? 'francophone' : 'anglophone';
      ensure((cls!.section || cls!.type) === section && (!cls!.cycle || cls!.cycle === 'primary') && cls!.educationType !== 'technical', 'Subsystem mismatch');
      const id = batchDigest([schoolId, academicYearId, item.targetId, item.sourceVersion, item.mappingVersion]);
      const ref = db.collection('curriculumProposalReviews').doc(id);
      const auditRef = db.collection('audit_logs').doc(batchDigest(['delegated-level-audit-v1', decisionBatchId, id]));
      const historyRef = ref.collection('history').doc('1');
      const [previous, history, audit] = await Promise.all([tx.get(ref), tx.get(historyRef), tx.get(auditRef)]);
      if (receipt.exists) {
        ensure(receipt.data()?.manifestDigest === policy.manifestDigest && receipt.data()?.status === 'CONSUMED', 'Batch receipt conflict');
        for (const snapshot of [previous, history]) {
          const d = snapshot.data();
          ensure(d?.decisionBatchId === decisionBatchId && d.decision === 'APPROVED' && d.revision === 1 && d.sourceVersion === item.sourceVersion && d.mappingVersion === item.mappingVersion && d.authorizationReference === policy.authorizationReference && d.decisionOrigin === 'OWNER_EXPLICIT_DELEGATED_DECISION' && d.decidedBy === 'system/delegated-workflow' && d.decisionAuthorizedByRole === 'owner' && !!d.decidedAt, 'Recorded decision changed; no replay');
        }
        ensure(audit.data()?.actorRole === 'system' && audit.data()?.details?.decisionBatchId === decisionBatchId, 'Audit missing or changed');
      } else ensure(!previous.exists && !history.exists && !audit.exists, 'Concurrent decision or orphan record; whole batch blocked');
      return { item, proposal: p!, ref, historyRef, auditRef, classroomTime: timestampVersion(classroom!.updateTime) };
    }));
    const snapshot = batchDigest([policy.manifestDigest, timestampVersion(school.updateTime), timestampVersion(year.updateTime), rows.map(r => [r.item.targetId, r.classroomTime]), receipt.exists]);
    const result = { expected: 12, matched: 12, conflicts: 0, applied: 0, persisted: receipt.exists ? 12 : 0, idempotent: receipt.exists, snapshot, manifestDigest: policy.manifestDigest };
    if (mode === 'dry-run' || receipt.exists) return result;
    ensure(dryRunSnapshot === snapshot, 'Matching dry run required; state changed');
    for (const row of rows) {
      const record = {
        schoolId, academicYearId, classId: row.item.targetId, proposalId: row.proposal.id,
        decision: 'APPROVED', decisionNote: row.item.reason, revision: 1,
        decidedBy: 'system/delegated-workflow', decisionRecordedBy: 'system/delegated-workflow', decisionAuthorizedByRole: 'owner',
        decisionOrigin: 'OWNER_EXPLICIT_DELEGATED_DECISION', authorizationReference: policy.authorizationReference,
        decisionBatchId, sourceVersion: row.item.sourceVersion, mappingVersion: row.item.mappingVersion,
        decidedAt: FieldValue.serverTimestamp(), scope: 'DOCUMENTARY_CLASS_MAPPING_ONLY', sourceAuthenticationChanged: false, adoptionChanged: false,
      };
      tx.create(row.ref, record); tx.create(row.historyRef, record);
      tx.create(row.auditRef, { schoolId, action: 'CURRICULUM_PROPOSAL_DECIDED', actorUid: 'system/delegated-workflow', actorRole: 'system', targetType: 'curriculumProposalReview', targetId: row.ref.id, canonicalBackendAudit: true, timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), details: { academicYearId, classId: row.item.targetId, decision: 'APPROVED', revision: 1, sourceVersion: row.item.sourceVersion, mappingVersion: row.item.mappingVersion, decisionBatchId, authorizationReference: policy.authorizationReference, decisionOrigin: record.decisionOrigin, decisionAuthorizedByRole: 'owner', decisionRecordedBy: record.decisionRecordedBy } });
    }
    tx.create(receiptRef, { schoolId, academicYearId, decisionBatchId, manifestDigest: policy.manifestDigest, authorizationReference: policy.authorizationReference, status: 'CONSUMED', actorUid: 'system/delegated-workflow', recordedAt: FieldValue.serverTimestamp() });
    return { ...result, applied: 12, persisted: 12 };
  });
}
