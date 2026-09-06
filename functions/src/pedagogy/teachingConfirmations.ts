import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { audit, requireId, requirePedagogyActor } from './authorization';
import { parseTeachingDeclaration } from './teachingEvidence';

type Data = admin.firestore.DocumentData;
const fail = (message: string): never => { throw new functions.https.HttpsError('failed-precondition', message); };
const active = (value: Data): boolean => value.active !== false && value.isActive !== false && !['archived', 'inactive', 'draft'].includes(value.status);
const owned = (snap: admin.firestore.DocumentSnapshot, schoolId: string): Data => {
  if (!snap.exists || snap.data()?.schoolId !== schoolId) throw new functions.https.HttpsError('permission-denied', 'Document absent ou hors établissement.');
  return snap.data()!;
};

// A batch records the teacher's declaration; receipt/review never implies teaching.
export const recordTeachingConfirmations = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId);
  const academicYearId = requireId(raw?.academicYearId, 'academicYearId');
  const classId = requireId(raw?.classId, 'classId');
  const weekId = requireId(raw?.weekId, 'weekId');
  const requestId = requireId(raw?.requestId, 'requestId');
  if (!Array.isArray(raw?.declarations) || !raw.declarations.length || raw.declarations.length > 25) throw new functions.https.HttpsError('invalid-argument', 'De 1 à 25 déclarations sont requises.');
  const declarations = raw.declarations.map((entry: Data) => ({ ...entry, preparationId: requireId(entry?.preparationId, 'preparationId'), teacherStaffId: requireId(entry?.teacherStaffId, 'teacherStaffId') })) as Data[];
  if (new Set(declarations.map(entry => entry.preparationId)).size !== declarations.length) throw new functions.https.HttpsError('invalid-argument', 'Préparation dupliquée.');
  const db = admin.firestore();
  const receiptId = createHash('sha256').update(`${schoolId}|${actor.uid}|${requestId}`).digest('hex');
  const receiptRef = db.collection('teachingConfirmationBatches').doc(receiptId);
  const payloadChecksum = createHash('sha256').update(JSON.stringify({ academicYearId, classId, weekId, declarations })).digest('hex');
  return db.runTransaction(async transaction => {
    const receipt = await transaction.get(receiptRef);
    if (receipt.exists) {
      if (receipt.data()?.payloadChecksum !== payloadChecksum) throw new functions.https.HttpsError('already-exists', 'Cet identifiant de saisie correspond à une autre déclaration.');
      return { recordedCount: receipt.data()!.recordedCount, idempotent: true };
    }
    const [yearSnap, classSnap, weekSnap, assignments] = await Promise.all([
      transaction.get(db.collection('academicYears').doc(academicYearId)), transaction.get(db.collection('classes').doc(classId)),
      transaction.get(db.collection('teachingWeeks').doc(weekId)),
      transaction.get(db.collection('teacherAssignments').where('schoolId', '==', schoolId).where('academicYearId', '==', academicYearId).where('classId', '==', classId).limit(201))
    ]);
    const year = owned(yearSnap, schoolId), classroom = owned(classSnap, schoolId), week = owned(weekSnap, schoolId);
    if (!active(year) || !active(classroom) || week.academicYearId !== academicYearId || week.status !== 'open') fail('Année, classe ou semaine indisponible pour une déclaration.');
    if (assignments.size > 200) fail('Trop d’affectations pour cette classe : contrôle administratif requis.');
    const snapshots = await Promise.all(declarations.flatMap(entry => [transaction.get(db.collection('lessonPreparations').doc(entry.preparationId)), transaction.get(db.collection('staff').doc(entry.teacherStaffId))]));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const updates = declarations.map((entry, index) => {
      const snap = snapshots[index * 2], preparation = owned(snap, schoolId), teacher = owned(snapshots[index * 2 + 1], schoolId);
      if (preparation.academicYearId !== academicYearId || preparation.classId !== classId || preparation.weekId !== weekId) fail('Préparation hors classe, année ou semaine sélectionnée.');
      if (teacher.role !== 'teacher' || !active(teacher) || !assignments.docs.some(doc => {
        const assignment = doc.data();
        return active(assignment) && (assignment.status === 'active' || assignment.isActive === true) && assignment.teacherStaffId === entry.teacherStaffId && assignment.subjectId === preparation.subjectId;
      })) throw new functions.https.HttpsError('permission-denied', 'Enseignant non affecté à cette matière et cette classe.');
      if (entry.expectedVersion !== preparation.version) throw new functions.https.HttpsError('aborted', 'La préparation a changé. Rechargez avant de confirmer.');
      let declaration;
      try { declaration = parseTeachingDeclaration(entry, preparation, { weekStartDate: week.weekStartDate, weekEndDate: week.weekEndDate }, today); }
      catch (error) { throw new functions.https.HttpsError('invalid-argument', error instanceof Error ? error.message : 'Déclaration invalide.'); }
      const confirmationId = `${receiptId}__${index}`;
      const confirmation = { ...declaration, id: confirmationId, declaredByTeacherStaffId: entry.teacherStaffId, recordedBy: actor.uid, recordedAt: FieldValue.serverTimestamp() };
      return { snap, preparation, confirmation, confirmationId };
    });
    for (const { snap, preparation, confirmation, confirmationId } of updates) {
      transaction.create(db.collection('teachingConfirmations').doc(confirmationId), { ...confirmation, schoolId, academicYearId, classId, weekId, subjectId: preparation.subjectId, preparationId: snap.id, previousConfirmationId: preparation.teachingConfirmation?.id || null, preparationVersion: preparation.version });
      transaction.update(snap.ref, { teachingConfirmation: confirmation, version: preparation.version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
      audit(transaction, actor, schoolId, 'teaching_declaration_recorded', 'lessonPreparation', snap.id, { confirmationId, status: confirmation.status, declaredByTeacherStaffId: confirmation.declaredByTeacherStaffId, previousConfirmationId: preparation.teachingConfirmation?.id || null });
    }
    transaction.create(receiptRef, { schoolId, academicYearId, classId, weekId, payloadChecksum, recordedCount: updates.length, recordedBy: actor.uid, recordedAt: FieldValue.serverTimestamp() });
    return { recordedCount: updates.length, idempotent: false };
  });
});
