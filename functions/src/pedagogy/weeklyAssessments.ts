import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { audit, PedagogyActor, requireId, requirePedagogyActor } from './authorization';
import { admissibleTeachingContent } from './teachingEvidence';
import { readClassPedagogyPolicy } from './classPolicies';
import { generateAssessmentContent } from './aiAssessment';
import {
  assessmentId, coverageFor,
  fridayForWeek, sourceChecksum, ValidatedPreparationSource
} from './weeklyAssessmentGenerator';

const db = () => admin.firestore();
type Data = admin.firestore.DocumentData;
const text = (value: unknown, name: string, max = 2000): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new functions.https.HttpsError('invalid-argument', `${name} invalide.`);
  return value.trim();
};
const documentId = (value: unknown, name: string): string => {
  const id = text(value, name, 500);
  if (id.includes('/')) throw new functions.https.HttpsError('invalid-argument', `${name} invalide.`);
  return id;
};
const optionalText = (value: unknown, max = 2000): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
const schoolDocument = (snap: admin.firestore.DocumentSnapshot, schoolId: string, label: string): Data => {
  if (!snap.exists) throw new functions.https.HttpsError('not-found', `${label} introuvable.`);
  const data = snap.data()!;
  const schoolRoot = snap.ref.parent.id === 'schools' && snap.id === schoolId;
  if (!schoolRoot && data.schoolId !== schoolId) throw new functions.https.HttpsError('permission-denied', 'Accès inter-écoles interdit.');
  return data;
};

export interface WeeklyAssessmentSources {
  identity: { schoolId: string; academicYearId: string; classId: string; weekId: string };
  school: Data; academicYear: Data; classData: Data; week: Data;
  expected: Data[]; validated: ValidatedPreparationSource[];
  excluded: Array<{ preparationId: string; subjectId: string; reason: string }>;
  coverage: ReturnType<typeof coverageFor>; checksum: string;
}

export const readWeeklyAssessmentSources = async (raw: Data, schoolId: string): Promise<WeeklyAssessmentSources> => {
  const academicYearId = requireId(raw.academicYearId, 'academicYearId');
  const classId = requireId(raw.classId, 'classId');
  const weekId = requireId(raw.weekId, 'weekId');
  const [schoolSnap, yearSnap, classSnap, weekSnap, preparationsSnap] = await Promise.all([
    db().collection('schools').doc(schoolId).get(), db().collection('academicYears').doc(academicYearId).get(),
    db().collection('classes').doc(classId).get(), db().collection('teachingWeeks').doc(weekId).get(),
    db().collection('lessonPreparations').where('schoolId', '==', schoolId).where('academicYearId', '==', academicYearId)
      .where('classId', '==', classId).where('weekId', '==', weekId).limit(251).get()
  ]);
  const school = schoolDocument(schoolSnap, schoolId, 'École');
  const academicYear = schoolDocument(yearSnap, schoolId, 'Année scolaire');
  const classData = schoolDocument(classSnap, schoolId, 'Classe');
  const week = schoolDocument(weekSnap, schoolId, 'Semaine');
  if (week.academicYearId !== academicYearId || week.status !== 'open' || academicYear.status === 'archived' || classData.isActive === false) throw new functions.https.HttpsError('failed-precondition', 'Classe, année ou semaine pédagogique incompatible.');
  if (preparationsSnap.size > 250) throw new functions.https.HttpsError('resource-exhausted', 'Plus de 250 préparations dans la semaine : scindez le périmètre avant de générer.');
  const expected: Data[] = preparationsSnap.docs.map(document => ({ id: document.id, ...document.data() }));
  const admissible = expected.map(preparation => ({ preparation, ...admissibleTeachingContent(preparation) }));
  const excluded = admissible.filter(item => item.exclusion).map(item => ({ preparationId: item.preparation.id, subjectId: item.preparation.subjectId, reason: item.exclusion! }));
  const validated: ValidatedPreparationSource[] = admissible.filter(item => !item.exclusion).map(({ preparation, content }) => ({
    id: preparation.id, version: Number(preparation.version || 1), subjectId: preparation.subjectId,
    classSubjectId: preparation.classSubjectId || preparation.subjectId, subjectName: preparation.subjectName || preparation.subjectId,
    curriculumUnitId: preparation.curriculumUnitId || null,
    lessonTitle: preparation.teachingConfirmation.status === 'partially_taught' ? content.slice(0, 300) : preparation.reviewData.lessonTitle || null,
    objective: preparation.teachingConfirmation.status === 'partially_taught' ? null : preparation.reviewData.objective || null,
    pedagogicalContent: content,
    teachingConfirmationId: preparation.teachingConfirmation.id,
    teachingStatus: preparation.teachingConfirmation.status,
    effectiveTeachingDate: preparation.teachingConfirmation.effectiveDate
  }));
  const coverage = coverageFor(expected.map(preparation => ({ subjectId: String(preparation.subjectId), subjectName: String(preparation.subjectName || preparation.subjectId) })), validated);
  return { identity: { schoolId, academicYearId, classId, weekId }, school, academicYear, classData, week, expected, validated, excluded, coverage, checksum: sourceChecksum(validated) };
};

const numericAssessmentPolicy = async (sources: WeeklyAssessmentSources) => {
  const { schoolId, academicYearId, classId } = sources.identity;
  const policy = await readClassPedagogyPolicy(schoolId, academicYearId, classId, sources.classData);
  if (policy.assessmentMode !== 'numeric' || policy.totalPoints === null) throw new functions.https.HttpsError('failed-precondition', 'Cette classe utilise les activités et observations, sans note ni classement.');
  return { ...policy, totalPoints: policy.totalPoints };
};

const coverageFields = (sources: WeeklyAssessmentSources) => ({
  coveredSubjects: sources.coverage.coveredSubjects, missingSubjects: sources.coverage.missingSubjects,
  validatedPreparationCount: sources.coverage.validatedPreparationCount, expectedPreparationCount: sources.coverage.expectedPreparationCount,
  coveragePercent: sources.coverage.coveragePercent, partial: sources.coverage.validatedPreparationCount < sources.coverage.expectedPreparationCount || sources.validated.some(item => item.teachingStatus === 'partially_taught'),
  excludedPreparations: sources.excluded,
  partiallyCoveredSubjects: sources.coverage.coveredSubjects.filter(subject => sources.excluded.some(item => item.subjectId === subject.id) || sources.validated.some(item => item.subjectId === subject.id && item.teachingStatus === 'partially_taught')),
  currentSourceChecksum: sources.checksum, sourceEligibilityPolicy: 'confirmed-teaching-v1'
});

export const ensureWeeklyAssessmentDraft = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId);
  const sources = await readWeeklyAssessmentSources(raw || {}, schoolId);
  const policy = await numericAssessmentPolicy(sources);
  const id = assessmentId(schoolId, sources.identity.academicYearId, sources.identity.classId, sources.identity.weekId);
  const ref = db().collection('weeklyAssessments').doc(id);
  const result = await db().runTransaction(async transaction => {
    const current = await transaction.get(ref);
    if (current.exists) {
      const data = current.data()!;
      return { created: false, status: data.status, generationVersion: data.generationVersion || 0, sourceChanged: Boolean(data.sourceChecksum && data.sourceChecksum !== sources.checksum) };
    }
    transaction.create(ref, {
      id, ...sources.identity, weekStartDate: sources.week.weekStartDate, weekEndDate: sources.week.weekEndDate,
      fridayDate: fridayForWeek(sources.week.weekStartDate), className: sources.classData.name || sources.identity.classId,
      academicYearName: sources.academicYear.name || sources.identity.academicYearId, schoolName: sources.school.name || schoolId,
      status: 'draft', generationStatus: 'pending', generationVersion: 0, ...coverageFields(sources),
      totalPoints: policy.totalPoints, durationMinutes: policy.durationMinutes, policySnapshot: policy,
      createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid
    });
    audit(transaction, actor, schoolId, 'weekly_assessment_draft_created', 'weeklyAssessment', id, { ...sources.identity, ...sources.coverage });
    return { created: true, status: 'draft', generationVersion: 0, sourceChanged: false };
  });
  return { assessmentId: id, ...result, coverage: sources.coverage };
});

export const generateWeeklyAssessment = functions.runWith({ timeoutSeconds: 180, memory: '512MB', secrets: ['PEDAGOGY_OPENAI_API_KEY'] }).https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId);
  return generateWeeklyAssessmentForActor(raw || {}, schoolId, actor);
});

export const generateWeeklyAssessmentForActor = async (raw: Data, schoolId: string, actor: PedagogyActor) => {
  const sources = await readWeeklyAssessmentSources(raw || {}, schoolId);
  const policy = await numericAssessmentPolicy(sources);
  if (!sources.validated.length) throw new functions.https.HttpsError('failed-precondition', 'Aucun cours confirmé exploitable');
  if (Buffer.byteLength(JSON.stringify(sources.validated), 'utf8') > 700000) throw new functions.https.HttpsError('resource-exhausted', 'Sources trop volumineuses : réduisez le périmètre sans tronquer les cours.');
  const id = assessmentId(schoolId, sources.identity.academicYearId, sources.identity.classId, sources.identity.weekId);
  const ref = db().collection('weeklyAssessments').doc(id);
  const regenerate = raw?.regenerate === true;
  const confirmRevision = raw?.confirmRevision === true;
  const claim = await db().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const current = snap.data();
    if (current?.status === 'archived') throw new functions.https.HttpsError('failed-precondition', 'Cette évaluation est archivée.');
    if (current?.generationStatus === 'processing' && (current.generationStartedAt?.toMillis?.() || 0) > Date.now() - 5 * 60 * 1000) return { generate: false, version: current.generationVersion || 1, status: current.status, idempotent: true };
    if (current?.generationStatus === 'succeeded' && current?.sourceChecksum === sources.checksum && (current.policySnapshot?.version || 1) === policy.version && current?.generationVersion > 0 && !regenerate) return { generate: false, version: current.generationVersion, status: current.status, idempotent: true };
    if (['teacher_validated', 'ready_to_print'].includes(current?.status) && !confirmRevision) {
      throw new functions.https.HttpsError('failed-precondition', 'Confirmez explicitement la création d’une nouvelle révision après validation enseignant.');
    }
    const version = Number(current?.generationVersion || 0) + 1;
    const base = {
      id, ...sources.identity, weekStartDate: sources.week.weekStartDate, weekEndDate: sources.week.weekEndDate,
      fridayDate: fridayForWeek(sources.week.weekStartDate), className: sources.classData.name || sources.identity.classId,
      academicYearName: sources.academicYear.name || sources.identity.academicYearId, schoolName: sources.school.name || schoolId,
      status: 'generating', generationStatus: 'processing', generationVersion: version, generationStartedAt: FieldValue.serverTimestamp(),
      ...coverageFields(sources), teacherValidated: false, teacherValidationRecordedBy: null,
      teacherValidationRecordedAt: null, teacherValidatedAt: null, teacherValidationNote: null,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid
    };
    if (snap.exists) transaction.update(ref, base); else transaction.create(ref, { ...base, createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid });
    audit(transaction, actor, schoolId, 'weekly_assessment_generation_started', 'weeklyAssessment', id, { generationVersion: version, sourceChecksum: sources.checksum });
    return { generate: true, version, status: 'generating', idempotent: false };
  });
  if (!claim.generate) return { assessmentId: id, generationVersion: claim.version, status: claim.status, idempotent: true };
  try {
    const output = await generateAssessmentContent(schoolId, {
      school: { id: schoolId, name: sources.school.name || schoolId },
      academicYear: { id: sources.identity.academicYearId, name: sources.academicYear.name || sources.identity.academicYearId },
      class: { id: sources.identity.classId, name: sources.classData.name || sources.identity.classId },
      week: { id: sources.identity.weekId, startDate: sources.week.weekStartDate, endDate: sources.week.weekEndDate, fridayDate: fridayForWeek(sources.week.weekStartDate) },
      validatedPreparations: sources.validated, subjects: sources.coverage.coveredSubjects,
      pedagogicalContent: sources.validated, assessmentPolicy: policy
    }, policy.language);
    const generated = output.generated;
    await db().runTransaction(async batch => {
    const current = await batch.get(ref);
    if (current.data()?.generationVersion !== claim.version || current.data()?.status !== 'generating') throw new Error('GENERATION_SUPERSEDED');
    generated.items.forEach(item => {
      const itemId = `${id}__v${claim.version}__q${String(item.order).padStart(3, '0')}`;
      batch.create(db().collection('assessmentItems').doc(itemId), {
        id: itemId, weeklyAssessmentId: id, ...sources.identity, ...item, generationVersion: claim.version,
        createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid
      });
    });
    const sourceSnapshot = sources.validated;
    batch.create(ref.collection('revisions').doc(String(claim.version)), {
      schoolId, academicYearId: sources.identity.academicYearId, classId: sources.identity.classId, weekId: sources.identity.weekId,
      generationVersion: claim.version, sourceChecksum: sources.checksum, sourceSnapshot, policySnapshot: policy,
      generatorProvider: output.provider, generatorVersion: output.version, aiOperationId: output.operationId,
      generated, createdBy: actor.uid, createdAt: FieldValue.serverTimestamp()
    });
    batch.update(ref, {
      status: 'needs_review', generationStatus: 'succeeded', generatorProvider: output.provider, aiOperationId: output.operationId,
      generatorVersion: output.version, title: generated.title, instructions: generated.instructions, generationError: null,
      durationMinutes: generated.durationMinutes, totalPoints: generated.totalPoints, sections: generated.sections, warnings: generated.warnings,
      itemCount: generated.items.length, policySnapshot: policy,
      sourcePreparationIds: sources.validated.map(source => source.id), sourcePreparationVersions: Object.fromEntries(sources.validated.map(source => [source.id, source.version])),
      sourceChecksum: sources.checksum, sourceSnapshot, ...coverageFields(sources), generationCompletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid
    });
    batch.create(db().collection('audit_logs').doc(), {
      schoolId, action: 'weekly_assessment_generated', actorUid: actor.uid, actorRole: actor.role, targetType: 'weeklyAssessment', targetId: id,
      details: { generationVersion: claim.version, sourceChecksum: sources.checksum, itemCount: generated.items.length, totalPoints: generated.totalPoints },
      timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), canonicalBackendAudit: true
    });
    });
    return { assessmentId: id, generationVersion: claim.version, status: 'needs_review', idempotent: false, coverage: sources.coverage };
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 200) : 'GENERATION_FAILED';
    await db().runTransaction(async transaction => {
      const current = await transaction.get(ref);
      if (current.data()?.generationVersion !== claim.version || current.data()?.status !== 'generating') return;
      transaction.update(ref, { status: 'failed', generationStatus: 'failed', generationError: reason, failedSourceChecksum: sources.checksum, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
      audit(transaction, actor, schoolId, 'weekly_assessment_generation_failed', 'weeklyAssessment', id, { generationVersion: claim.version, reason, sourceChecksum: sources.checksum });
    });
    return { assessmentId: id, generationVersion: claim.version, status: 'failed', error: reason, retryable: true };
  }
};

const itemEdit = (raw: unknown, index: number): { id: string; questionText: string; instructions: string; points: number; order: number } => {
  if (!raw || typeof raw !== 'object') throw new functions.https.HttpsError('invalid-argument', `Question ${index + 1} invalide.`);
  const value = raw as Data;
  const points = Number(value.points);
  const order = Number(value.order);
  if (!Number.isFinite(points) || points <= 0 || points > 100 || !Number.isInteger(order) || order < 1 || order > 100) throw new functions.https.HttpsError('invalid-argument', 'Barème ou ordre invalide.');
  return { id: documentId(value.id, 'itemId'), questionText: text(value.questionText, 'questionText'), instructions: text(value.instructions, 'instructions', 1000), points, order };
};

export const saveWeeklyAssessmentEdits = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId);
  const id = documentId(raw?.assessmentId, 'assessmentId');
  const edits: Array<ReturnType<typeof itemEdit>> = Array.isArray(raw?.items) ? raw.items.map((item: unknown, index: number) => itemEdit(item, index)) : [];
  if (!edits.length) throw new functions.https.HttpsError('invalid-argument', 'Aucune question à enregistrer.');
  if (new Set(edits.map(item => item.id)).size !== edits.length || new Set(edits.map(item => item.order)).size !== edits.length) throw new functions.https.HttpsError('invalid-argument', 'Questions ou ordres dupliqués.');
  const ref = db().collection('weeklyAssessments').doc(id);
  await db().runTransaction(async transaction => {
    const assessment = schoolDocument(await transaction.get(ref), schoolId, 'Évaluation');
    if (!['needs_review', 'failed'].includes(assessment.status)) throw new functions.https.HttpsError('failed-precondition', 'Le brouillon n’est pas modifiable dans cet état.');
    if (edits.length !== Number(assessment.itemCount)) throw new functions.https.HttpsError('failed-precondition', 'Toutes les questions de la version courante sont requises.');
    const total = edits.reduce((sum, item) => sum + item.points, 0);
    if (Math.abs(total - Number(assessment.totalPoints)) > 0.0001) throw new functions.https.HttpsError('failed-precondition', `Le total doit rester égal à ${assessment.totalPoints}.`);
    const itemRefs = edits.map(edit => db().collection('assessmentItems').doc(edit.id));
    const itemSnaps = await Promise.all(itemRefs.map(itemRef => transaction.get(itemRef)));
    itemSnaps.forEach((itemSnap, index) => {
      const edit = edits[index];
      const item = schoolDocument(itemSnap, schoolId, 'Question');
      if (item.weeklyAssessmentId !== id || item.generationVersion !== assessment.generationVersion) throw new functions.https.HttpsError('failed-precondition', 'Question hors de la version courante.');
      transaction.update(itemRefs[index], { questionText: edit.questionText, instructions: edit.instructions, points: edit.points, order: edit.order, lastEditedBy: actor.uid, lastEditedAt: FieldValue.serverTimestamp(), editReason: optionalText(raw?.note, 1000) || 'Corrections enregistrées à la demande de l’enseignant.' });
    });
    transaction.update(ref, { status: 'needs_review', lastEditedBy: actor.uid, lastEditedAt: FieldValue.serverTimestamp(), editReason: optionalText(raw?.note, 1000) || 'Corrections enregistrées à la demande de l’enseignant.', updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    audit(transaction, actor, schoolId, 'weekly_assessment_edited', 'weeklyAssessment', id, { generationVersion: assessment.generationVersion, itemCount: edits.length });
  });
  return { assessmentId: id, status: 'needs_review' };
});

export const recordWeeklyAssessmentTeacherValidation = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId);
  const id = documentId(raw?.assessmentId, 'assessmentId');
  const teacherStaffId = requireId(raw?.teacherStaffId, 'teacherStaffId');
  const [teacherSnap] = await Promise.all([db().collection('staff').doc(teacherStaffId).get()]);
  const teacher = schoolDocument(teacherSnap, schoolId, 'Enseignant');
  if (teacher.role !== 'teacher') throw new functions.https.HttpsError('failed-precondition', 'Le membre du personnel sélectionné doit être enseignant.');
  const ref = db().collection('weeklyAssessments').doc(id);
  await db().runTransaction(async transaction => {
    const assessment = schoolDocument(await transaction.get(ref), schoolId, 'Évaluation');
    if (assessment.status !== 'needs_review') throw new functions.https.HttpsError('failed-precondition', 'Le brouillon doit être relu avant la validation enseignant.');
    transaction.update(ref, {
      status: 'teacher_validated', teacherValidated: true, teacherValidatedAt: FieldValue.serverTimestamp(), teacherStaffId,
      teacherValidationRecordedBy: actor.uid, teacherValidationRecordedAt: FieldValue.serverTimestamp(), teacherValidationNote: optionalText(raw?.note, 1000),
      teacherValidationMeaning: 'Validation de l’enseignant enregistrée par la secrétaire.', updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid
    });
    audit(transaction, actor, schoolId, 'weekly_assessment_teacher_validation_recorded', 'weeklyAssessment', id, { teacherStaffId, generationVersion: assessment.generationVersion });
  });
  return { assessmentId: id, status: 'teacher_validated' };
});

export const markWeeklyAssessmentReadyToPrint = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId);
  const id = documentId(raw?.assessmentId, 'assessmentId');
  const ref = db().collection('weeklyAssessments').doc(id);
  await db().runTransaction(async transaction => {
    const assessment = schoolDocument(await transaction.get(ref), schoolId, 'Évaluation');
    if (assessment.status !== 'teacher_validated' || assessment.teacherValidated !== true) throw new functions.https.HttpsError('failed-precondition', 'La validation de l’enseignant doit être enregistrée.');
    transaction.update(ref, { status: 'ready_to_print', readyToPrintAt: FieldValue.serverTimestamp(), readyToPrintBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    audit(transaction, actor, schoolId, 'weekly_assessment_ready_to_print', 'weeklyAssessment', id, { generationVersion: assessment.generationVersion });
  });
  return { assessmentId: id, status: 'ready_to_print' };
});

export const archiveWeeklyAssessment = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId, ['superAdmin', 'owner', 'director']);
  const id = documentId(raw?.assessmentId, 'assessmentId');
  const ref = db().collection('weeklyAssessments').doc(id);
  await db().runTransaction(async transaction => {
    const assessment = schoolDocument(await transaction.get(ref), schoolId, 'Évaluation');
    if (assessment.status === 'archived') return;
    transaction.update(ref, { status: 'archived', archivedAt: FieldValue.serverTimestamp(), archivedBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    audit(transaction, actor, schoolId, 'weekly_assessment_archived', 'weeklyAssessment', id, { previousStatus: assessment.status });
  });
  return { assessmentId: id, status: 'archived' };
});
