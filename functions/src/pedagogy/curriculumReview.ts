import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { audit, requireId, requirePedagogyActor } from './authorization';
import { curriculumReviewProposals } from './curriculumReviewManifest';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const curriculumReviewId = (school: string, year: string, classroom: string, source: string, mapping: string) => digest([school, year, classroom, source, mapping]);
interface ReviewItem { classId: string; proposal: typeof curriculumReviewProposals[number]; decision: string; decisionNote: string; expectedRevision: number }

/** Correspondence review: never adopts a curriculum or authenticates a source. */
export const recordCurriculumProposalDecisions = functions.https.onCall(async (data, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, data?.schoolId, ['owner']);
  const academicYearId = requireId(data?.academicYearId, 'academicYearId');
  const requestId = requireId(data?.requestId, 'requestId');
  if (!Array.isArray(data?.items) || !data.items.length || data.items.length > 12 || data.confirmed !== true) throw new functions.https.HttpsError('invalid-argument', 'Confirmation explicite et 1 à 12 décisions requises.');
  const items: ReviewItem[] = data.items.map((raw: Record<string, unknown>) => {
    const classId = requireId(raw?.classId, 'classId');
    const proposal = curriculumReviewProposals.find(p => p.id === raw?.proposalId);
    if (!proposal || raw.sourceVersion !== proposal.sourceVersion || raw.mappingVersion !== proposal.mappingVersion) throw new functions.https.HttpsError('aborted', 'Version documentaire modifiée : rechargez.');
    if (!['APPROVED', 'REQUEST_CHANGE', 'NOT_APPLICABLE'].includes(String(raw.decision)) || !Number.isInteger(raw.expectedRevision) || Number(raw.expectedRevision) < 0 || typeof raw.decisionNote !== 'string' || !raw.decisionNote.trim() || raw.decisionNote.length > 2000) throw new functions.https.HttpsError('invalid-argument', 'Décision, note et révision attendue requises.');
    if (raw.decision === 'APPROVED' && (proposal.missingSource || !proposal.sources.length)) throw new functions.https.HttpsError('failed-precondition', 'Source insuffisante : correction documentaire nécessaire avant approbation.');
    if (data.items.length > 1 && (raw.decision !== 'APPROVED' || !proposal.highConfidence)) throw new functions.https.HttpsError('invalid-argument', 'Action groupée réservée aux correspondances à forte confiance.');
    return { classId, proposal, decision: String(raw.decision), decisionNote: raw.decisionNote.trim(), expectedRevision: Number(raw.expectedRevision) };
  });
  if (new Set(items.map(item => item.classId)).size !== items.length) throw new functions.https.HttpsError('invalid-argument', 'Classe dupliquée.');
  const db = admin.firestore(), requestRef = db.collection('curriculumReviewRequests').doc(digest([schoolId, actor.uid, requestId]));
  const fingerprint = digest([academicYearId, items]);
  return db.runTransaction(async transaction => {
    const [user, year, request] = await Promise.all([transaction.get(db.doc('users/' + actor.uid)), transaction.get(db.doc('academicYears/' + academicYearId)), transaction.get(requestRef)]);
    if (user.data()?.role !== 'owner' || user.data()?.isActive !== true || user.data()?.schoolId !== schoolId) throw new functions.https.HttpsError('permission-denied', 'Droits propriétaire modifiés.');
    if (year.data()?.schoolId !== schoolId || year.data()?.status !== 'active' || year.data()?.isActive === false) throw new functions.https.HttpsError('failed-precondition', 'Année active de cet établissement requise.');
    if (request.exists) {
      if (request.data()?.fingerprint !== fingerprint) throw new functions.https.HttpsError('already-exists', 'Identifiant de requête déjà utilisé.');
      return { recordedCount: items.length, idempotent: true };
    }
    const rows = await Promise.all(items.map(async item => {
      const p = item.proposal;
      const ref = db.collection('curriculumProposalReviews').doc(curriculumReviewId(schoolId, academicYearId, item.classId, p.sourceVersion, p.mappingVersion));
      const [classroom, previous] = await Promise.all([transaction.get(db.doc('classes/' + item.classId)), transaction.get(ref)]);
      const cls = classroom.data();
      if (!cls || cls.schoolId !== schoolId || cls.catalogLevelId !== p.catalogLevelId || cls.isActive === false || cls.active === false || ['inactive', 'archived'].includes(cls.status) || (cls.academicYearId && cls.academicYearId !== academicYearId)) throw new functions.https.HttpsError('permission-denied', 'Classe active et correspondance du même établissement requises.');
      if ((previous.data()?.revision || 0) !== item.expectedRevision) throw new functions.https.HttpsError('aborted', 'Décision concurrente : rechargez.');
      return { item, ref };
    }));
    for (const { item, ref } of rows) {
      const revision = item.expectedRevision + 1;
      const record = { schoolId, academicYearId, classId: item.classId, proposalId: item.proposal.id, decision: item.decision, decidedBy: actor.uid, decidedAt: FieldValue.serverTimestamp(), decisionNote: item.decisionNote, sourceVersion: item.proposal.sourceVersion, mappingVersion: item.proposal.mappingVersion, revision, requestId, scope: 'DOCUMENTARY_CLASS_MAPPING_ONLY', sourceAuthenticationChanged: false, adoptionChanged: false };
      transaction.set(ref, record);
      transaction.create(ref.collection('history').doc(String(revision)), record);
      audit(transaction, actor, schoolId, 'CURRICULUM_PROPOSAL_DECIDED', 'curriculumProposalReview', ref.id, { academicYearId, classId: item.classId, proposalId: item.proposal.id, decision: item.decision, revision, sourceVersion: item.proposal.sourceVersion, mappingVersion: item.proposal.mappingVersion, requestId });
    }
    transaction.create(requestRef, { schoolId, actorUid: actor.uid, fingerprint, recordedAt: FieldValue.serverTimestamp() });
    return { recordedCount: items.length, idempotent: false };
  });
});
