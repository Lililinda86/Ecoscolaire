import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { audit, PedagogyActor, requireId, requirePedagogyActor } from './authorization';
import { activePedagogyDocument, boundedPedagogyText, responsibleTeacher, scopedDocument } from './scopes';
import { defaultPedagogyPolicy, parsePedagogyPolicy } from './pedagogyPolicy';
import { pedagogyPolicyId } from './classPolicies';
import { preschoolReviewProposal, PreschoolPreparation } from './preschoolReviewGenerator';

type Data = admin.firestore.DocumentData;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const preschoolReviewId = (schoolId: string, academicYearId: string, classId: string, weekId: string) => digest(['preschool-weekly-review-v1', schoolId, academicYearId, classId, weekId]);

/** Same secretary-declaration workflow as the numeric branch. All sources and
 * eligibility are reread inside the writing transaction. No provider, student
 * mutation, grade, diagnosis or implicit declaration is part of this workflow. */
export async function managePreschoolReviewForActor(raw: Data, schoolId: string, actor: PedagogyActor) {
  const academicYearId = requireId(raw.academicYearId, 'academicYearId'), classId = requireId(raw.classId, 'classId'), weekId = requireId(raw.weekId, 'weekId');
  const operation = raw.operation || 'read';
  if (!['read', 'generate', 'record_teacher_agreement'].includes(operation)) throw new functions.https.HttpsError('invalid-argument', 'Opération inconnue.');
  const db = admin.firestore(), id = preschoolReviewId(schoolId, academicYearId, classId, weekId), ref = db.collection('preschoolWeeklyReviews').doc(id);
  return db.runTransaction(async tx => {
    const [schoolSnap, yearSnap, classSnap, weekSnap, policySnap, currentSnap, preparationsSnap] = await Promise.all([
      tx.get(db.doc('schools/' + schoolId)), tx.get(db.doc('academicYears/' + academicYearId)), tx.get(db.doc('classes/' + classId)), tx.get(db.doc('teachingWeeks/' + weekId)),
      tx.get(db.doc('pedagogyClassPolicies/' + pedagogyPolicyId(schoolId, academicYearId, classId))), tx.get(ref),
      tx.get(db.collection('lessonPreparations').where('schoolId', '==', schoolId).where('academicYearId', '==', academicYearId).where('classId', '==', classId).where('weekId', '==', weekId).limit(251)),
    ]);
    const year = scopedDocument(yearSnap, schoolId), classroom = scopedDocument(classSnap, schoolId), week = scopedDocument(weekSnap, schoolId);
    if (!schoolSnap.exists || schoolSnap.data()?.activeAcademicYearId !== academicYearId || year.status !== 'active' || !activePedagogyDocument(classroom) || classroom.academicYearId && classroom.academicYearId !== academicYearId || week.academicYearId !== academicYearId || week.status !== 'open') throw new functions.https.HttpsError('failed-precondition', 'Année, classe et semaine actives requises.');
    if (preparationsSnap.size > 250) throw new functions.https.HttpsError('resource-exhausted', 'Périmètre de préparations trop volumineux.');
    const savedPolicy = policySnap.exists ? scopedDocument(policySnap, schoolId) : null;
    if (savedPolicy && (savedPolicy.academicYearId !== academicYearId || savedPolicy.classId !== classId)) throw new functions.https.HttpsError('permission-denied', 'Politique hors périmètre.');
    const policy = savedPolicy ? parsePedagogyPolicy(savedPolicy.policy, classroom, savedPolicy.version) : defaultPedagogyPolicy(classroom);
    let proposal;
    try {
      proposal = preschoolReviewProposal(preparationsSnap.docs.map(d => ({ ...d.data(), id: d.id, version: d.data().version || 1, subjectId: d.data().subjectId, subjectName: d.data().subjectName || d.data().subjectId }) as PreschoolPreparation), policy);
    } catch { throw new functions.https.HttpsError('failed-precondition', 'Parcours préscolaire qualitatif requis.'); }
    if (Buffer.byteLength(JSON.stringify(proposal), 'utf8') > 650000) throw new functions.https.HttpsError('resource-exhausted', 'Sources trop volumineuses, aucune troncature effectuée.');
    const current = currentSnap.exists ? scopedDocument(currentSnap, schoolId) : null;
    if (current && (current.academicYearId !== academicYearId || current.classId !== classId || current.weekId !== weekId)) throw new functions.https.HttpsError('permission-denied', 'Bilan hors périmètre.');
    const changed = Boolean(current && current.sourceChecksum !== proposal.sourceChecksum);
    if (operation === 'read') return { reviewId: id, review: current, sourceChanged: changed, availableActivityCount: proposal.activities.length };
    if (!proposal.activities.length) throw new functions.https.HttpsError('failed-precondition', 'Aucune activité réalisée et confirmée exploitable.');
    if (operation === 'generate') {
      if (current && !changed) return { reviewId: id, review: current, sourceChanged: false, idempotent: true };
      if (current && (raw.expectedVersion !== current.generationVersion || raw.confirmRevision !== true)) throw new functions.https.HttpsError('aborted', 'Les sources ont changé : confirmez explicitement une nouvelle révision.');
      if (!current && raw.expectedVersion !== undefined && raw.expectedVersion !== 0) throw new functions.https.HttpsError('aborted', 'Version du bilan modifiée.');
      const generationVersion = (current?.generationVersion || 0) + 1;
      const record = { id, schoolId, academicYearId, classId, weekId, className: classroom.name || classId, weekStartDate: week.weekStartDate, weekEndDate: week.weekEndDate,
        ...proposal, generationVersion, policySnapshot: policy, teacherValidations: [], createdBy: actor.uid, createdAt: FieldValue.serverTimestamp() };
      tx.set(ref, record); tx.create(ref.collection('revisions').doc(String(generationVersion)), record);
      audit(tx, actor, schoolId, 'preschool_weekly_review_proposed', 'preschoolWeeklyReview', id, { generationVersion, sourceChecksum: proposal.sourceChecksum, activityCount: proposal.activities.length, generatorProvider: proposal.generatorProvider });
      return { reviewId: id, generationVersion, status: 'needs_review', sourceChanged: false, idempotent: false };
    }
    if (!current || changed || raw.expectedVersion !== current.generationVersion || raw.sourceChecksum !== current.sourceChecksum) throw new functions.https.HttpsError('aborted', 'Bilan ou activités modifiés : rechargez et faites relire la version courante.');
    if (raw.declarationReceived !== true) throw new functions.https.HttpsError('failed-precondition', 'Accord de l’enseignant effectivement reçu requis.');
    const teacherStaffId = requireId(raw.teacherStaffId, 'teacherStaffId'), subjectId = requireId(raw.subjectId, 'subjectId');
    const note = boundedPedagogyText(raw.note, 'Note de déclaration', 2000);
    const subjects = [...new Set(proposal.activities.map(a => a.subjectId))];
    if (!subjects.includes(subjectId)) throw new functions.https.HttpsError('permission-denied', 'Domaine absent du bilan.');
    await responsibleTeacher(tx, db, { schoolId, academicYearId, classId, subjectId }, teacherStaffId);
    const validations: Data[] = current.teacherValidations || [];
    if (validations.some(v => v.subjectId === subjectId)) return { reviewId: id, status: current.status, idempotent: true };
    const decisionId = digest([id, current.generationVersion, subjectId]);
    const decisionRef = ref.collection('teacherDecisions').doc(decisionId);
    const prior = await tx.get(decisionRef);
    if (prior.exists) throw new functions.https.HttpsError('aborted', 'Décision déjà enregistrée : rechargez.');
    const decision = { subjectId, teacherStaffId, generationVersion: current.generationVersion, sourceChecksum: current.sourceChecksum, declarationReceived: true, note, recordedBy: actor.uid, recordedAt: FieldValue.serverTimestamp() };
    // Server timestamps cannot be array elements: immutable decision holds its
    // server timestamp, while the current array is an indexed approval summary.
    const summaries = [...validations, { subjectId, teacherStaffId, decisionId, generationVersion: current.generationVersion }];
    const complete = subjects.every(s => summaries.some(v => v.subjectId === s));
    const status = complete ? 'ready_to_print' : 'needs_review';
    tx.create(decisionRef, { schoolId, academicYearId, classId, weekId, ...decision });
    tx.update(ref, { teacherValidations: summaries, teacherValidated: complete, status, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
    audit(tx, actor, schoolId, 'preschool_weekly_teacher_agreement_recorded', 'preschoolWeeklyReview', id, { generationVersion: current.generationVersion, subjectId, teacherStaffId, decisionId, sourceChecksum: current.sourceChecksum });
    return { reviewId: id, status, idempotent: false };
  });
}

export const managePreschoolWeeklyReview = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId);
  return managePreschoolReviewForActor(raw || {}, schoolId, actor);
});
