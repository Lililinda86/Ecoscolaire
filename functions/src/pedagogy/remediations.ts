import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { audit, requireId, requirePedagogyActor } from './authorization';
import { activePedagogyDocument, boundedPedagogyText, responsibleTeacher, scopedDocument } from './scopes';
import { validDate } from './teachingEvidence';
import { nextRemediationStatus, REMEDIATION_OUTCOMES } from './remediationPolicy';

type Data = admin.firestore.DocumentData;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
// Only detailed observations or canonical scored results are accepted as a
// reason to propose support. Neither automatically establishes a difficulty.
async function readEvidence(transaction: admin.firestore.Transaction, db: admin.firestore.Firestore, schoolId: string, kind: unknown, id: string) {
  if (kind !== 'observation' && kind !== 'grade') throw new functions.https.HttpsError('invalid-argument', 'Type de preuve invalide.');
  const value = scopedDocument(await transaction.get(db.collection(kind === 'observation' ? 'pedagogyObservations' : 'grades').doc(id)), schoolId, 'Preuve');
  if (kind === 'observation') {
    if (value.supersededBy || !['discovering', 'developing', 'acquired'].includes(value.state)) throw new functions.https.HttpsError('failed-precondition', 'Observation courante effectivement réalisée requise.');
    return { kind, id, schoolId, academicYearId: value.academicYearId, classId: value.classId, studentId: value.studentId, subjectId: value.subjectId, date: value.date, state: value.state, objective: value.objective, objectiveId: value.objectiveId, version: 1 };
  }
  if (!value.evaluationId || !Number.isInteger(value.version) || value.version < 1 || value.resultStatus !== 'scored' || typeof value.score !== 'number' || !Number.isFinite(value.score) || !(value.maxScore > 0) || value.score < 0 || value.score > value.maxScore) throw new functions.https.HttpsError('failed-precondition', 'Résultat canonique chiffré explicite requis ; une absence n’est pas une difficulté.');
  const evaluation = scopedDocument(await transaction.get(db.collection('evaluations').doc(value.evaluationId)), schoolId, 'Épreuve');
  if (evaluation.academicYearId !== value.academicYearId || evaluation.classId !== value.classId || evaluation.subjectId !== value.subjectId) throw new functions.https.HttpsError('failed-precondition', 'Résultat et épreuve incompatibles.');
  return { kind, id, schoolId, academicYearId: value.academicYearId, classId: value.classId, studentId: value.studentId, subjectId: value.subjectId, date: evaluation.date, score: value.score, maxScore: value.maxScore, evaluationId: value.evaluationId, version: value.version };
}

export const managePedagogyRemediation = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId);
  const requestId = requireId(raw?.requestId, 'requestId');
  if (!['CREATE', 'APPROVE', 'COMPLETE', 'REVIEW', 'CANCEL'].includes(raw?.action)) throw new functions.https.HttpsError('invalid-argument', 'Action invalide.');
  const action = raw.action as string, db = admin.firestore();
  const id = action === 'CREATE' ? digest([schoolId, actor.uid, requestId]) : requireId(raw.remediationId, 'remediationId');
  const ref = db.collection('pedagogyRemediations').doc(id);
  const receiptRef = db.collection('pedagogyRemediationRequests').doc(digest([schoolId, actor.uid, requestId]));
  const payloadHash = digest(raw);
  return db.runTransaction(async transaction => {
    const receipt = await transaction.get(receiptRef);
    if (receipt.exists) {
      if (receipt.data()?.payloadHash !== payloadHash) throw new functions.https.HttpsError('already-exists', 'Cette demande contient une autre saisie.');
      return { remediationId: id, version: receipt.data()!.version, idempotent: true };
    }
    const previous = await transaction.get(ref);
    let value: Data;
    if (action === 'CREATE') {
      if (previous.exists) throw new functions.https.HttpsError('already-exists', 'Proposition déjà présente.');
      const source = await readEvidence(transaction, db, schoolId, raw.sourceKind, requireId(raw.sourceId, 'sourceId'));
      if (!validDate(source.date) || source.date > today()) throw new functions.https.HttpsError('failed-precondition', 'Date de preuve invalide.');
      value = { id, schoolId, academicYearId: source.academicYearId, classId: source.classId, studentId: source.studentId, subjectId: source.subjectId,
        source, competencyId: null, status: 'proposed', version: 1, proposedActivity: boundedPedagogyText(raw.activity, 'Activité proposée', 2000),
        reason: boundedPedagogyText(raw.reason, 'Motif contextualisé', 2000), dueDate: raw.dueDate,
        createdBy: actor.uid, createdAt: FieldValue.serverTimestamp() };
    } else {
      value = scopedDocument(previous, schoolId, 'Remédiation');
      if (value.version !== raw.expectedVersion) throw new functions.https.HttpsError('aborted', 'La remédiation a changé : rechargez.');
      let status;
      try { status = nextRemediationStatus(value.status, raw.action); } catch { throw new functions.https.HttpsError('failed-precondition', 'Transition non autorisée.'); }
      const teacherStaffId = requireId(raw.teacherStaffId, 'teacherStaffId');
      if (raw.declarationReceived !== true || !validDate(raw.date) || raw.date > today() || raw.date < value.source.date) throw new functions.https.HttpsError('failed-precondition', 'Décision datée de l’enseignant reçue requise.');
      await responsibleTeacher(transaction, db, { schoolId, academicYearId: value.academicYearId, classId: value.classId, subjectId: value.subjectId }, teacherStaffId);
      const declaration = { teacherStaffId, date: raw.date, note: boundedPedagogyText(raw.note, 'Compte rendu enseignant', 2000), recordedBy: actor.uid, recordedAt: FieldValue.serverTimestamp() };
      if (action === 'APPROVE') {
        const fresh = await readEvidence(transaction, db, schoolId, value.source.kind, value.source.id);
        if (digest(fresh) !== digest(value.source)) throw new functions.https.HttpsError('failed-precondition', 'Preuve rectifiée : annulez et proposez une action depuis la preuve courante.');
        value = { ...value, approval: declaration };
      }
      if (action === 'COMPLETE') {
        if (raw.date < value.approval.date) throw new functions.https.HttpsError('failed-precondition', 'Réalisation antérieure à l’approbation.');
        value = { ...value, completion: declaration };
      }
      if (action === 'REVIEW') {
        if (raw.date < value.completion.date || !REMEDIATION_OUTCOMES.includes(raw.outcome)) throw new functions.https.HttpsError('failed-precondition', 'Bilan daté après réalisation requis.');
        const evidence = await readEvidence(transaction, db, schoolId, raw.evidenceKind, requireId(raw.evidenceId, 'evidenceId'));
        if (evidence.studentId !== value.studentId || evidence.academicYearId !== value.academicYearId || evidence.classId !== value.classId || evidence.subjectId !== value.subjectId || evidence.date < value.completion.date || evidence.date > raw.date || evidence.id === value.source.id && evidence.kind === value.source.kind) throw new functions.https.HttpsError('failed-precondition', 'Une nouvelle preuve du même élève et de la même matière après réalisation est requise.');
        value = { ...value, review: { ...declaration, outcome: raw.outcome, evidence } };
      }
      if (action === 'CANCEL') value = { ...value, cancellation: declaration };
      value = { ...value, status, version: value.version + 1 };
    }
    const [studentSnap, yearSnap, classSnap] = await Promise.all([
      transaction.get(db.collection('students').doc(value.studentId)), transaction.get(db.collection('academicYears').doc(value.academicYearId)), transaction.get(db.collection('classes').doc(value.classId))
    ]);
    const student = scopedDocument(studentSnap, schoolId, 'Élève'), year = scopedDocument(yearSnap, schoolId, 'Année'), classroom = scopedDocument(classSnap, schoolId, 'Classe');
    if (student.academicYearId !== value.academicYearId || student.classId !== value.classId || !activePedagogyDocument(student) || student.schoolingStatus && student.schoolingStatus !== 'active' || !activePedagogyDocument(classroom) || year.status !== 'active') throw new functions.https.HttpsError('failed-precondition', 'Inscription active dans le périmètre requis.');
    if (!validDate(value.dueDate) || value.dueDate < value.source.date || value.dueDate < year.startDate || value.dueDate > year.endDate) throw new functions.https.HttpsError('invalid-argument', 'Échéance dans l’année, après la preuve initiale, requise.');
    if (action !== 'CREATE' && (raw.date < year.startDate || raw.date > year.endDate)) throw new functions.https.HttpsError('invalid-argument', 'Date hors année scolaire.');
    const next = { ...value, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() };
    transaction.set(ref, next);
    transaction.create(ref.collection('history').doc(String(value.version)), { schoolId, action, previous: previous.data() || null, next, actorUid: actor.uid, recordedAt: FieldValue.serverTimestamp() });
    transaction.create(receiptRef, { schoolId, payloadHash, remediationId: id, version: value.version });
    audit(transaction, actor, schoolId, `pedagogy_remediation_${action.toLowerCase()}`, 'pedagogyRemediation', id, { version: value.version, studentId: value.studentId, status: value.status });
    return { remediationId: id, version: value.version, idempotent: false };
  });
});
