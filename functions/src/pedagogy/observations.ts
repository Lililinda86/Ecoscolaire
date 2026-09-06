import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { audit, requireId, requirePedagogyActor } from './authorization';
import { admissibleTeachingContent, validDate } from './teachingEvidence';
import { OBSERVATION_STATES } from './pedagogyPolicy';
import { readClassPedagogyPolicy } from './classPolicies';
import { activePedagogyDocument, boundedPedagogyText, responsibleTeacher, scopedDocument } from './scopes';

export const recordPedagogyObservations = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId);
  const academicYearId = requireId(raw?.academicYearId, 'academicYearId'), classId = requireId(raw?.classId, 'classId');
  const teacherStaffId = requireId(raw?.teacherStaffId, 'teacherStaffId'), preparationId = requireId(raw?.preparationId, 'preparationId');
  const requestId = requireId(raw?.requestId, 'requestId');
  const date = raw.date;
  if (!validDate(date)) throw new functions.https.HttpsError('invalid-argument', 'Date d’observation invalide.');
  if (raw.declarationReceived !== true) throw new functions.https.HttpsError('failed-precondition', 'La déclaration de l’enseignant doit avoir été reçue.');
  const objective = boundedPedagogyText(raw.objective, 'Objectif observable', 1000);
  if (!Array.isArray(raw.rows) || !raw.rows.length || raw.rows.length > 25) throw new functions.https.HttpsError('invalid-argument', 'De 1 à 25 observations requises.');
  const rows = raw.rows.map((row: admin.firestore.DocumentData) => {
    if (!OBSERVATION_STATES.includes(row?.state)) throw new functions.https.HttpsError('invalid-argument', 'État d’observation invalide.');
    return { studentId: requireId(row.studentId, 'studentId'), state: row.state as typeof OBSERVATION_STATES[number], comment: boundedPedagogyText(row.comment, 'Contexte observé', 2000), supersedesId: row.supersedesId ? requireId(row.supersedesId, 'supersedesId') : null };
  }) as Array<{ studentId: string; state: typeof OBSERVATION_STATES[number]; comment: string; supersedesId: string | null }>;
  if (new Set(rows.map(row => row.studentId)).size !== rows.length) throw new functions.https.HttpsError('invalid-argument', 'Élève dupliqué.');
  const db = admin.firestore(), batchId = createHash('sha256').update(`${schoolId}|${actor.uid}|${requestId}`).digest('hex');
  const receiptRef = db.collection('pedagogyObservationBatches').doc(batchId);
  const payloadHash = createHash('sha256').update(JSON.stringify({ academicYearId, classId, teacherStaffId, preparationId, date, objective, rows })).digest('hex');
  const classroom = scopedDocument(await db.collection('classes').doc(classId).get(), schoolId, 'Classe');
  const policy = await readClassPedagogyPolicy(schoolId, academicYearId, classId, classroom);
  return db.runTransaction(async transaction => {
    const receipt = await transaction.get(receiptRef);
    if (receipt.exists) {
      if (receipt.data()?.payloadHash !== payloadHash) throw new functions.https.HttpsError('already-exists', 'Identifiant de saisie réutilisé avec un autre contenu.');
      return { observationIds: receipt.data()!.observationIds, idempotent: true };
    }
    const [prepSnap, yearSnap, freshClass, ...students] = await Promise.all([
      transaction.get(db.collection('lessonPreparations').doc(preparationId)), transaction.get(db.collection('academicYears').doc(academicYearId)), transaction.get(db.collection('classes').doc(classId)),
      ...rows.map(row => transaction.get(db.collection('students').doc(row.studentId)))
    ]);
    const preparation = scopedDocument(prepSnap, schoolId, 'Préparation'), year = scopedDocument(yearSnap, schoolId, 'Année');
    if (!activePedagogyDocument(scopedDocument(freshClass, schoolId, 'Classe')) || year.status !== 'active' || preparation.classId !== classId || preparation.academicYearId !== academicYearId) throw new functions.https.HttpsError('failed-precondition', 'Périmètre pédagogique incompatible.');
    const content = admissibleTeachingContent(preparation);
    if (content.exclusion || !content.content.includes(objective)) throw new functions.https.HttpsError('failed-precondition', 'L’objectif observé doit être un extrait exact du cours confirmé.');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (date < year.startDate || date > year.endDate || date > today || date < preparation.teachingConfirmation.effectiveDate) throw new functions.https.HttpsError('invalid-argument', 'Date hors année ou antérieure au cours ou future.');
    await responsibleTeacher(transaction, db, { schoolId, academicYearId, classId, subjectId: preparation.subjectId }, teacherStaffId);
    const previous = await Promise.all(rows.map(row => row.supersedesId ? transaction.get(db.collection('pedagogyObservations').doc(row.supersedesId)) : Promise.resolve(null)));
    rows.forEach((row, index) => {
      const student = scopedDocument(students[index], schoolId, 'Élève');
      if (student.classId !== classId || student.academicYearId !== academicYearId || !activePedagogyDocument(student)) throw new functions.https.HttpsError('failed-precondition', 'Élève non inscrit dans cette classe et cette année.');
      if (previous[index]) {
        const prior = scopedDocument(previous[index]!, schoolId, 'Observation');
        if (prior.studentId !== row.studentId || prior.classId !== classId || prior.academicYearId !== academicYearId || prior.preparationId !== preparationId || prior.objective !== objective || prior.supersededBy) throw new functions.https.HttpsError('failed-precondition', 'Rectification incompatible ou observation déjà rectifiée.');
      }
    });
    const objectiveId = createHash('sha256').update(`${preparationId}|${preparation.teachingConfirmation.id}|${objective}`).digest('hex');
    const observationIds = rows.map((row, index) => {
      const id = `${batchId}__${index}`;
      transaction.create(db.collection('pedagogyObservations').doc(id), {
        id, schoolId, academicYearId, classId, studentId: row.studentId, subjectId: preparation.subjectId,
        preparationId, teachingConfirmationId: preparation.teachingConfirmation.id, objectiveId, objective, competencyId: null,
        date, state: row.state, comment: row.comment, supersedesId: row.supersedesId, supersededBy: null,
        teacherStaffId, declaredByTeacherStaffId: teacherStaffId, recordedBy: actor.uid, recordedAt: FieldValue.serverTimestamp(),
        sourceMode: 'teacher_declaration', policySnapshot: policy, schemaVersion: 'pedagogy-observation-v1'
      });
      if (previous[index]) transaction.update(previous[index]!.ref, { supersededBy: id });
      audit(transaction, actor, schoolId, 'pedagogy_observation_recorded', 'pedagogyObservation', id, { teacherStaffId, supersedesId: row.supersedesId, state: row.state });
      return id;
    });
    transaction.create(receiptRef, { schoolId, payloadHash, observationIds, recordedBy: actor.uid, createdAt: FieldValue.serverTimestamp() });
    return { observationIds, idempotent: false };
  });
});
