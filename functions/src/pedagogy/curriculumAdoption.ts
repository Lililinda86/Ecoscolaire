import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { adoptionId } from './ids';
import { audit, requireId, requirePedagogyActor } from './authorization';

/** Records a received decision, never authenticates a source or invents a visa. */
export const adoptCurriculumProgram = functions.https.onCall(async (data, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, data?.schoolId);
  const academicYearId = requireId(data?.academicYearId, 'academicYearId');
  const catalogLevelId = requireId(data?.catalogLevelId, 'catalogLevelId');
  const curriculumProgramId = requireId(data?.curriculumProgramId, 'curriculumProgramId');
  const reviewOutcome = data?.reviewOutcome ?? 'approve';
  if (!['approve', 'request_correction', 'not_applicable'].includes(reviewOutcome)) throw new functions.https.HttpsError('invalid-argument', 'Type de décision invalide.');
  const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  const date = data?.decisionDate;
  const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00Z') : null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (data?.declarationReceived !== true || !text(data?.decisionBy, 150) || !text(data?.decisionReference, 1000) ||
      !parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > today ||
      !Number.isInteger(data?.expectedRevision) || data.expectedRevision < 0 || !text(data?.expectedProgramVersion, 100)) {
    throw new functions.https.HttpsError('invalid-argument', 'Décision reçue, auteur, date, référence et versions consultées requis.');
  }
  const db = admin.firestore();
  const ref = db.collection('schoolCurriculumAdoptions').doc(adoptionId(schoolId, academicYearId, catalogLevelId));
  const reviewRef = ref.collection('reviewDecisions').doc();
  return db.runTransaction(async transaction => {
    const [year, program, previous, units] = await Promise.all([
      transaction.get(db.collection('academicYears').doc(academicYearId)),
      transaction.get(db.collection('curriculumPrograms').doc(curriculumProgramId)),
      transaction.get(ref),
      transaction.get(db.collection('curriculumUnits').where('programId', '==', curriculumProgramId).where('catalogLevelId', '==', catalogLevelId).limit(501)),
    ]);
    const yearData = year.data(), programData = program.data(), old = previous.data();
    if (!yearData || yearData.schoolId !== schoolId || (old && old.schoolId !== schoolId)) throw new functions.https.HttpsError('permission-denied', 'Périmètre établissement invalide.');
    if (yearData.status !== 'active' || yearData.isActive === false || yearData.active === false) throw new functions.https.HttpsError('failed-precondition', 'Année scolaire inactive.');
    if (!programData || programData.status !== 'published') throw new functions.https.HttpsError('failed-precondition', 'Version du catalogue non publiée.');
    if (programData.version !== data.expectedProgramVersion || (old?.revision || 0) !== data.expectedRevision) throw new functions.https.HttpsError('aborted', 'Version modifiée : rechargez avant de consigner la décision.');
    if (reviewOutcome !== 'approve') {
      transaction.create(reviewRef, { id: reviewRef.id, schoolId, academicYearId, catalogLevelId, curriculumProgramId,
        programVersion: programData.version, reviewOutcome, declarationReceived: true, declaredBy: data.decisionBy.trim(),
        effectiveDate: date, reference: data.decisionReference.trim(), recordedBy: actor.uid, recordedAt: FieldValue.serverTimestamp(),
        adoptionChanged: false, sourceAuthentication: 'not_established_by_review' });
      audit(transaction, actor, schoolId, 'CURRICULUM_REVIEW_RECORDED', 'schoolCurriculumReview', reviewRef.id, { academicYearId, catalogLevelId, curriculumProgramId, reviewOutcome });
      return { reviewDecisionId: reviewRef.id, reviewOutcome, adoptionChanged: false };
    }
    if (units.size > 500) throw new functions.https.HttpsError('resource-exhausted', 'Plus de500 unités pour ce niveau : contrôle documentaire requis.');
    if (!units.docs.some(unit => unit.data().status === 'published')) throw new functions.https.HttpsError('failed-precondition', 'Ce programme ne contient aucune unité publiée pour le niveau choisi.');
    const revision = (old?.revision || 0) + 1;
    const record = {
      id: ref.id, schoolId, academicYearId, catalogLevelId, curriculumProgramId, status: 'active', revision,
      programVersion: programData.version, programChecksum: programData.checksum || null,
      decision: { declarationReceived: true, declaredBy: data.decisionBy.trim(), effectiveDate: date,
        reference: data.decisionReference.trim(), recordedBy: actor.uid, recordedAt: FieldValue.serverTimestamp() },
      sourceAuthentication: 'not_established_by_adoption',
      adoptedAt: FieldValue.serverTimestamp(), adoptedBy: actor.uid,
      createdAt: old?.createdAt || FieldValue.serverTimestamp(), createdBy: old?.createdBy || actor.uid,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
    };
    if (old && !old.revision) transaction.create(ref.collection('versions').doc('0'), { ...old, legacySnapshot: true, preservedAt: FieldValue.serverTimestamp() });
    transaction.create(ref.collection('versions').doc(String(revision)), { ...record, previousProgramId: old?.curriculumProgramId || null });
    transaction.set(ref, record, { merge: true });
    audit(transaction, actor, schoolId, 'CURRICULUM_PROGRAM_ADOPTED', 'schoolCurriculumAdoption', ref.id, { academicYearId, catalogLevelId, curriculumProgramId, revision, programVersion: programData.version });
    return { adoptionId: ref.id, curriculumProgramId, revision };
  });
});
