import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { assertEvaluationDependencies, canonicalGradeId, parseGradeRows } from '../academic/manageGrades';
import { audit, requireId, requirePedagogyActor } from './authorization';
import { allSubjectsValidated, sameAssessmentReviewVersion, SubjectTeacherValidation } from './assessmentReview';
import { activePedagogyDocument, responsibleTeacher, scopedDocument } from './scopes';
import { admissibleTeachingContent, validDate } from './teachingEvidence';
type Data = admin.firestore.DocumentData;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const longId = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim() || value.includes('/') || value.length > 500) throw new functions.https.HttpsError('invalid-argument', 'Identifiant de document invalide.');
  return value.trim();
};

export const publishPedagogyAssessmentToGrades = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId);
  const assessmentId = longId(raw?.assessmentId), periodId = requireId(raw?.periodId, 'periodId');
  if (!validDate(raw?.date) || raw?.confirmTransfer !== true) throw new functions.https.HttpsError('invalid-argument', 'Date et confirmation explicite du transfert requises.');
  const db = admin.firestore(), assessmentRef = db.collection('weeklyAssessments').doc(assessmentId);
  return db.runTransaction(async transaction => {
    const assessment = scopedDocument(await transaction.get(assessmentRef), schoolId, 'Évaluation pédagogique');
    if (!sameAssessmentReviewVersion(raw, assessment as { generationVersion: number }) || !['teacher_validated', 'ready_to_print'].includes(assessment.status)) throw new functions.https.HttpsError('failed-precondition', 'Une version courante validée par matière est requise.');
    const sections: Data[] = assessment.sections || [], decisions: SubjectTeacherValidation[] = assessment.teacherValidations || [];
    if (sections.length > 30 || !allSubjectsValidated(sections.map(item => item.subjectId), decisions, assessment as { generationVersion: number })) throw new functions.https.HttpsError('failed-precondition', 'Visas par matière incomplets.');
    if (assessment.policySnapshot?.assessmentMode !== 'numeric') throw new functions.https.HttpsError('failed-precondition', 'Les observations préscolaires ne sont pas des notes.');
    const publicationId = hash([schoolId, assessmentId, assessment.generationVersion, assessment.contentRevision || 0]);
    const publicationRef = db.collection('pedagogyAssessmentPublications').doc(publicationId);
    const requestHash = hash([periodId, raw.date, assessment.sourceChecksum]);
    const [previous, periodSnap, itemsSnap, preparations] = await Promise.all([
      transaction.get(publicationRef), transaction.get(db.collection('periods').doc(periodId)),
      transaction.get(db.collection('assessmentItems').where('schoolId', '==', schoolId).where('weeklyAssessmentId', '==', assessmentId).where('generationVersion', '==', assessment.generationVersion).limit(101)),
      transaction.get(db.collection('lessonPreparations').where('schoolId', '==', schoolId).where('academicYearId', '==', assessment.academicYearId).where('classId', '==', assessment.classId).where('weekId', '==', assessment.weekId).limit(251))
    ]);
    if (previous.exists) {
      const value = scopedDocument(previous, schoolId);
      if (value.requestHash !== requestHash) throw new functions.https.HttpsError('already-exists', 'Cette version est déjà transférée avec une autre date ou période.');
      return { publicationId, evaluationIds: value.evaluationIds, idempotent: true };
    }
    const period = scopedDocument(periodSnap, schoolId, 'Période');
    if (period.academicYearId !== assessment.academicYearId || period.status !== 'open' || raw.date < period.startDate || raw.date > period.endDate) throw new functions.https.HttpsError('failed-precondition', 'La date doit appartenir à une période ouverte de cette année.');
    const savedVersions = assessment.sourcePreparationVersions || {};
    const eligible = preparations.docs.filter(item => !admissibleTeachingContent(item.data()).exclusion);
    if (preparations.size > 250 || preparations.size !== assessment.expectedPreparationCount || eligible.length !== Object.keys(savedVersions).length || Object.entries(savedVersions).some(([id, version]) => eligible.find(item => item.id === id)?.data().version !== version)) throw new functions.https.HttpsError('failed-precondition', 'Sources modifiées depuis les visas enseignants.');
    if (itemsSnap.size > 100 || itemsSnap.size !== assessment.itemCount) throw new functions.https.HttpsError('failed-precondition', 'Questions de la version incomplètes.');
    const items: Data[] = itemsSnap.docs.map(item => ({ ...item.data(), id: item.id }));
    const evaluations: Data[] = [];
    for (const section of sections) {
      const decision = decisions.find(item => item.subjectId === section.subjectId)!;
      const scope = { schoolId, academicYearId: assessment.academicYearId, classId: assessment.classId, subjectId: section.subjectId };
      const assignment = await responsibleTeacher(transaction, db, scope, decision.teacherStaffId);
      const deps = await assertEvaluationDependencies(transaction, db, { ...scope, periodId, teacherAssignmentId: assignment.id, uid: actor.uid, role: actor.role, offlineTeacherStaffId: decision.teacherStaffId });
      const maxScore = items.filter(item => item.subjectId === section.subjectId).reduce((sum, item) => sum + Number(item.points), 0);
      if (!Number.isFinite(maxScore) || maxScore <= 0 || Math.abs(maxScore - Number(section.points)) > .0001) throw new functions.https.HttpsError('failed-precondition', 'Barème par matière incohérent.');
      evaluations.push({
        id: `pe_${hash([publicationId, section.subjectId])}`, ...scope, periodId,
        classSubjectId: deps.classSubjectId, teacherAssignmentId: assignment.id, teacherStaffId: decision.teacherStaffId, teacherUserId: assignment.teacherUserId || null,
        sourceProgramId: deps.programId, sourcePublishedRevisionId: deps.revisionId,
        title: String(assessment.title || 'Évaluation pédagogique').slice(0, 120) + ' — ' + String(section.title || section.subjectId).slice(0, 35),
        type: 'pedagogy_weekly', date: raw.date, maxScore, weight: 1, status: 'open', version: 1,
        pedagogyPublicationId: publicationId, sourceAssessmentId: assessmentId, sourceGenerationVersion: assessment.generationVersion,
        sourceContentRevision: assessment.contentRevision || 0, correctionTeacherStaffId: decision.teacherStaffId,
        createdBy: actor.uid, updatedBy: actor.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      });
    }
    const snapshot = { schoolId, academicYearId: assessment.academicYearId, classId: assessment.classId, assessmentId, requestHash, periodId, date: raw.date,
      generationVersion: assessment.generationVersion, contentRevision: assessment.contentRevision || 0, sourceChecksum: assessment.sourceChecksum,
      teacherDecisions: decisions, policySnapshot: assessment.policySnapshot, items, evaluationIds: evaluations.map(item => item.id) };
    if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > 750000) throw new functions.https.HttpsError('resource-exhausted', 'Épreuve trop volumineuse pour un transfert atomique.');
    for (const evaluation of evaluations) transaction.create(db.collection('evaluations').doc(evaluation.id), evaluation);
    transaction.create(publicationRef, { ...snapshot, createdBy: actor.uid, createdAt: FieldValue.serverTimestamp() });
    audit(transaction, actor, schoolId, 'pedagogy_assessment_transferred_to_grades', 'pedagogyAssessmentPublication', publicationId, { assessmentId, evaluationIds: snapshot.evaluationIds, generationVersion: assessment.generationVersion, contentRevision: assessment.contentRevision || 0 });
    return { publicationId, evaluationIds: snapshot.evaluationIds, idempotent: false };
  });
});

export const recordPedagogyResults = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId);
  const evaluationId = longId(raw?.evaluationId), requestId = requireId(raw?.requestId, 'requestId'), teacherStaffId = requireId(raw?.teacherStaffId, 'teacherStaffId');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (raw?.correctionReceived !== true || !validDate(raw?.correctionDate) || raw.correctionDate > today) throw new functions.https.HttpsError('failed-precondition', 'Correction enseignant reçue et datée requise.');
  const db = admin.firestore(), evaluationRef = db.collection('evaluations').doc(evaluationId);
  return db.runTransaction(async transaction => {
    const evaluation = scopedDocument(await transaction.get(evaluationRef), schoolId, 'Évaluation');
    if (evaluation.status !== 'open' || !evaluation.pedagogyPublicationId || raw.expectedEvaluationVersion !== evaluation.version) throw new functions.https.HttpsError('failed-precondition', 'Seule une évaluation pédagogique transférée, ouverte et dans sa version courante est saisissable ici.');
    const publication = scopedDocument(await transaction.get(db.collection('pedagogyAssessmentPublications').doc(evaluation.pedagogyPublicationId)), schoolId, 'Transfert pédagogique');
    if (!publication.evaluationIds?.includes(evaluationId) || publication.academicYearId !== evaluation.academicYearId || publication.classId !== evaluation.classId ||
        publication.generationVersion !== evaluation.sourceGenerationVersion || publication.contentRevision !== evaluation.sourceContentRevision || raw.correctionDate < evaluation.date) throw new functions.https.HttpsError('failed-precondition', 'Version transférée ou date de correction incohérente.');
    if (!Array.isArray(raw.rows) || raw.rows.length > 25) throw new functions.https.HttpsError('invalid-argument', 'Saisissez au maximum 25 résultats par lot.');
    const rows = parseGradeRows(raw.rows, Number(evaluation.maxScore));
    const payloadHash = hash([evaluationId, teacherStaffId, raw.correctionDate, raw.expectedEvaluationVersion, rows]);
    const receiptRef = db.collection('pedagogyResultBatches').doc(hash([schoolId, actor.uid, requestId]));
    const receipt = await transaction.get(receiptRef);
    if (receipt.exists) {
      if (receipt.data()?.payloadHash !== payloadHash) throw new functions.https.HttpsError('already-exists', 'Identifiant de saisie déjà utilisé avec un autre contenu.');
      return { count: receipt.data()!.count, idempotent: true };
    }
    const scope = { schoolId, academicYearId: String(evaluation.academicYearId), classId: String(evaluation.classId), subjectId: String(evaluation.subjectId) };
    const assignment = await responsibleTeacher(transaction, db, scope, teacherStaffId);
    if (assignment.id !== evaluation.teacherAssignmentId) throw new functions.https.HttpsError('failed-precondition', 'Affectation différente de celle de l’épreuve transférée.');
    const dependencies = await assertEvaluationDependencies(transaction, db, { ...scope, periodId: evaluation.periodId, teacherAssignmentId: assignment.id, uid: actor.uid, role: actor.role, offlineTeacherStaffId: teacherStaffId });
    if (dependencies.classSubjectId !== evaluation.classSubjectId || dependencies.programId !== evaluation.sourceProgramId || dependencies.revisionId !== evaluation.sourcePublishedRevisionId) throw new functions.https.HttpsError('failed-precondition', 'Révision du programme différente de l’épreuve transférée : réconciliation administrative requise.');
    const studentRefs = rows.map(row => db.collection('students').doc(String(row.studentId)));
    const gradeRefs = rows.map(row => db.collection('grades').doc(canonicalGradeId(evaluationId, String(row.studentId))));
    const [students, previousGrades] = await Promise.all([transaction.getAll(...studentRefs), transaction.getAll(...gradeRefs)]);
    rows.forEach((row, index) => {
      const student = scopedDocument(students[index], schoolId, 'Élève');
      if (student.classId !== evaluation.classId || student.academicYearId !== evaluation.academicYearId || !activePedagogyDocument(student) || student.schoolingStatus && student.schoolingStatus !== 'active') throw new functions.https.HttpsError('permission-denied', 'Élève hors classe active.');
      const previous = previousGrades[index].data();
      if (previous && (previous.schoolId !== schoolId || previous.evaluationId !== evaluationId || previous.studentId !== row.studentId)) throw new functions.https.HttpsError('permission-denied', 'Collision de note.');
      if (Number(previous?.version || 0) !== row.expectedVersion) throw new functions.https.HttpsError('aborted', 'Un résultat a changé : rechargez.');
    });
    rows.forEach((row, index) => {
      const previous = previousGrades[index].data(), version = Number(previous?.version || 0) + 1;
      const grade = { id: gradeRefs[index].id, ...scope, evaluationId, periodId: evaluation.periodId, classSubjectId: evaluation.classSubjectId, studentId: row.studentId,
        teacherAssignmentId: assignment.id, teacherStaffId, teacherId: teacherStaffId, teacherUserId: assignment.teacherUserId || null,
        resultStatus: row.resultStatus, ...(row.score !== undefined ? { score: row.score } : {}), ...(row.comment ? { comment: row.comment } : {}),
        maxScore: evaluation.maxScore, status: 'draft', version, pedagogyPublicationId: evaluation.pedagogyPublicationId,
        correctionTeacherStaffId: teacherStaffId, correctionDate: raw.correctionDate, recordedBy: actor.uid,
        createdBy: previous?.createdBy || actor.uid, createdAt: previous?.createdAt || FieldValue.serverTimestamp(), updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() };
      transaction.set(gradeRefs[index], grade);
      transaction.create(gradeRefs[index].collection('pedagogyHistory').doc(receiptRef.id), { schoolId, previous: previous || null, next: grade, recordedAt: FieldValue.serverTimestamp(), recordedBy: actor.uid });
      audit(transaction, actor, schoolId, previous ? 'GRADE_CORRECTED' : 'GRADE_RECORDED', 'grade', gradeRefs[index].id, { evaluationId, studentId: row.studentId, previousVersion: previous?.version || 0, newVersion: version, correctionTeacherStaffId: teacherStaffId, correctionDate: raw.correctionDate, resultStatus: row.resultStatus });
    });
    transaction.create(receiptRef, { schoolId, evaluationId, actorUid: actor.uid, payloadHash, count: rows.length, createdAt: FieldValue.serverTimestamp() });
    return { count: rows.length, idempotent: false };
  });
});
