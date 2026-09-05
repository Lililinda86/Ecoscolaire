import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { audit, requireId, requirePedagogyActor } from './authorization';
import { deterministicMockPreparationAnalyzer, validatePreparationAnalysis } from './preparationAnalyzer';

const db = () => admin.firestore();
const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const PREPARATION_MAX_FILE_BYTES = 10 * 1024 * 1024;

const safePart = (value: string): string => {
  const clean = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!clean || clean.length > 140) throw new functions.https.HttpsError('invalid-argument', 'Identifiant invalide.');
  return clean;
};
const text = (value: unknown, name: string, max = 1000): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new functions.https.HttpsError('invalid-argument', `${name} invalide.`);
  return value.trim();
};
const nullableText = (value: unknown, max = 1000): string | null => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
const schoolDocument = (snap: admin.firestore.DocumentSnapshot, schoolId: string, label: string): admin.firestore.DocumentData => {
  if (!snap.exists) throw new functions.https.HttpsError('not-found', `${label} introuvable.`);
  const value = snap.data()!;
  if (value.schoolId !== schoolId) throw new functions.https.HttpsError('permission-denied', 'Accès inter-écoles interdit.');
  return value;
};
export const preparationIdForItem = (itemId: string): string => {
  const safe = safePart(itemId);
  return `prep__${safe.slice(0, 32)}__${createHash('sha256').update(itemId).digest('hex').slice(0, 16)}`;
};
export const uploadIdForChecksum = (preparationId: string, checksum: string): string => `upload__${safePart(preparationId)}__${checksum.slice(0, 24)}`;
export const manualPreparationId = (...identity: string[]): string =>
  `prep__manual__${safePart(identity[0]).slice(0, 12)}__${createHash('sha256').update(identity.join('|')).digest('hex').slice(0, 24)}`;
export const canTransitionPreparation = (from: string, to: string): boolean => ({
  expected: ['uploaded'], uploaded: ['needs_review'], needs_review: ['needs_review', 'validated'], validated: []
} as Record<string, string[]>)[from]?.includes(to) === true;
const templateId = (schoolId: string, academicYearId: string, classId: string, subjectId: string): string =>
  `tpl__${safePart(schoolId)}__${safePart(academicYearId)}__${safePart(classId)}__${safePart(subjectId)}__v1`;
const baseTemplate = (id: string, schoolId: string, academicYearId: string, classId: string, subjectId: string, subjectName: string) => ({
  id, schoolId, academicYearId, classId, subjectId, subjectName, version: 1, status: 'active',
  schemaVersion: 'lesson-preparation-template-v1',
  sections: [
    { key: 'identity', title: 'Identification', fields: ['date', 'classe', 'matière', 'enseignant'] },
    { key: 'objectives', title: 'Objectifs et prérequis', fields: ['objectif', 'prérequis'] },
    { key: 'materials', title: 'Matériel', fields: ['supports', 'matériel'] },
    { key: 'sequence', title: 'Déroulement', fields: ['étapes', 'durées', 'consignes'] },
    { key: 'assessment', title: 'Évaluation et différenciation', fields: ['évaluation', 'différenciation'] }
  ]
});

export const ensureExpectedLessonPreparations = functions.https.onCall(async (data, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, data?.schoolId);
  const planId = requireId(data?.planId, 'planId');
  const plan = schoolDocument(await db().collection('teachingPlans').doc(planId).get(), schoolId, 'Planification');
  const itemsSnap = await db().collection('teachingPlanItems').where('schoolId', '==', schoolId).where('planId', '==', planId).limit(200).get();
  if (itemsSnap.empty) throw new functions.https.HttpsError('failed-precondition', 'Aucune séance planifiée.');
  let created = 0;
  const templatesCreated = new Set<string>();
  const batch = db().batch();
  for (const itemSnap of itemsSnap.docs) {
    const item = itemSnap.data();
    const preparationId = preparationIdForItem(itemSnap.id);
    const prepRef = db().collection('lessonPreparations').doc(preparationId);
    const templateRef = db().collection('lessonPreparationTemplates').doc(templateId(schoolId, plan.academicYearId, plan.classId, item.subjectId));
    const [existing, template] = await Promise.all([prepRef.get(), templateRef.get()]);
    if (!template.exists && !templatesCreated.has(templateRef.id)) {
      batch.create(templateRef, {
      ...baseTemplate(templateRef.id, schoolId, plan.academicYearId, plan.classId, item.subjectId, item.subjectName),
      createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid
    });
      templatesCreated.add(templateRef.id);
    }
    if (!existing.exists) {
      created += 1;
      batch.create(prepRef, {
        id: preparationId, schoolId, academicYearId: plan.academicYearId, classId: plan.classId,
        weekId: plan.weekId, weekNumber: plan.weekNumber, weekStartDate: plan.weekStartDate, weekEndDate: plan.weekEndDate,
        planId, teachingPlanItemId: itemSnap.id, source: 'planned', templateId: templateRef.id,
        subjectId: item.subjectId, subjectName: item.subjectName, teacherStaffId: item.teacherStaffId,
        curriculumUnitId: item.curriculumUnitId || null, lessonDate: item.lessonDate || null,
        dayIndex: item.dayIndex, slotIndex: item.slotIndex, lessonTitle: item.lessonTitle || null, objective: item.objective || null,
        status: 'expected', analysisStatus: 'not_started', version: 1,
        createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid
      });
    }
  }
  batch.create(db().collection('audit_logs').doc(), {
    schoolId, action: 'expected_preparations_ensured', actorUid: actor.uid, actorRole: actor.role,
    targetType: 'teachingPlan', targetId: planId, details: { expectedCount: itemsSnap.size, createdCount: created },
    timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), canonicalBackendAudit: true
  });
  await batch.commit();
  return { planId, expectedCount: itemsSnap.size, createdCount: created };
});

export const createLessonPreparationUpload = functions.https.onCall(async (data, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, data?.schoolId);
  const checksum = text(data?.checksum, 'checksum', 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new functions.https.HttpsError('invalid-argument', 'Empreinte SHA-256 invalide.');
  const mimeType = text(data?.mimeType, 'mimeType', 100);
  if (!allowedMimeTypes.includes(mimeType as typeof allowedMimeTypes[number])) throw new functions.https.HttpsError('invalid-argument', 'Format autorisé : PDF, JPEG ou PNG.');
  const size = data?.size;
  if (!Number.isInteger(size) || size < 1 || size > PREPARATION_MAX_FILE_BYTES) throw new functions.https.HttpsError('invalid-argument', 'Fichier vide ou supérieur à 10 Mio.');
  const originalFileName = text(data?.fileName, 'fileName', 180);
  let preparationId = typeof data?.preparationId === 'string' && data.preparationId ? requireId(data.preparationId, 'preparationId') : '';
  let preparation: admin.firestore.DocumentData | null = null;
  if (preparationId) preparation = schoolDocument(await db().collection('lessonPreparations').doc(preparationId).get(), schoolId, 'Préparation');
  if (!preparation) {
    const academicYearId = requireId(data?.academicYearId, 'academicYearId');
    const classId = requireId(data?.classId, 'classId');
    const subjectId = requireId(data?.subjectId, 'subjectId');
    const teacherStaffId = requireId(data?.teacherStaffId, 'teacherStaffId');
    const weekStartDate = text(data?.weekStartDate, 'weekStartDate', 10);
    const [yearSnap, classSnap, teacherSnap] = await Promise.all([
      db().collection('academicYears').doc(academicYearId).get(), db().collection('classes').doc(classId).get(), db().collection('staff').doc(teacherStaffId).get()
    ]);
    schoolDocument(yearSnap, schoolId, 'Année scolaire'); schoolDocument(classSnap, schoolId, 'Classe'); schoolDocument(teacherSnap, schoolId, 'Enseignant');
    preparationId = manualPreparationId(schoolId, academicYearId, classId, subjectId, teacherStaffId, weekStartDate, checksum);
    preparation = {
      id: preparationId, schoolId, academicYearId, classId, subjectId, subjectName: text(data?.subjectName, 'subjectName', 200),
      teacherStaffId, weekStartDate, lessonTitle: nullableText(data?.lessonTitle, 500), objective: nullableText(data?.objective),
      source: 'manual_unplanned', status: 'expected', analysisStatus: 'not_started', version: 1
    };
  }
  const uploadId = uploadIdForChecksum(preparationId, checksum);
  const extension = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg';
  const storagePath = `schools/${safePart(schoolId)}/pedagogy/preparations/${safePart(preparation.academicYearId)}/${uploadId}/original.${extension}`;
  const prepRef = db().collection('lessonPreparations').doc(preparationId);
  const uploadRef = db().collection('preparationUploads').doc(uploadId);
  return db().runTransaction(async transaction => {
    const existing = await transaction.get(uploadRef);
    if (existing.exists) return { preparationId, uploadId, storagePath: existing.data()?.storagePath, created: false };
    const currentPrep = await transaction.get(prepRef);
    if (!currentPrep.exists) transaction.create(prepRef, { ...preparation, createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    transaction.create(uploadRef, {
      id: uploadId, schoolId, preparationId, academicYearId: preparation!.academicYearId, classId: preparation!.classId,
      storagePath, originalFileName, mimeType, size, checksum, immutable: true, status: 'awaiting_upload',
      createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid
    });
    transaction.set(prepRef, { status: 'uploaded', analysisStatus: 'pending', currentUploadId: uploadId, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
    audit(transaction, actor, schoolId, 'preparation_upload_registered', 'preparationUpload', uploadId, { preparationId, mimeType, size, checksum });
    return { preparationId, uploadId, storagePath, created: true };
  });
});

export const startLessonPreparationAnalysis = functions.https.onCall(async (data, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, data?.schoolId);
  const uploadId = requireId(data?.uploadId, 'uploadId');
  const uploadRef = db().collection('preparationUploads').doc(uploadId);
  const upload = schoolDocument(await uploadRef.get(), schoolId, 'Dépôt');
  const prepRef = db().collection('lessonPreparations').doc(upload.preparationId);
  const preparation = schoolDocument(await prepRef.get(), schoolId, 'Préparation');
  const analysisId = `${safePart(uploadId)}__${deterministicMockPreparationAnalyzer.version}`;
  const analysisRef = db().collection('preparationAnalyses').doc(analysisId);
  const existing = await analysisRef.get();
  if (existing.exists) return { preparationId: prepRef.id, uploadId, analysisId, analysisStatus: existing.data()?.status, idempotent: true };
  try {
    const [metadata] = await admin.storage().bucket().file(upload.storagePath).getMetadata();
    if (metadata.contentType !== upload.mimeType || Number(metadata.size) !== upload.size ||
        metadata.metadata?.checksum !== upload.checksum || metadata.metadata?.preparationId !== upload.preparationId) {
      throw new Error('UPLOAD_METADATA_MISMATCH');
    }
    await db().runTransaction(async transaction => {
      transaction.update(uploadRef, { status: 'analyzing', analysisStartedAt: FieldValue.serverTimestamp() });
      transaction.update(prepRef, { analysisStatus: 'processing', updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
      audit(transaction, actor, schoolId, 'preparation_analysis_started', 'preparationUpload', uploadId, { preparationId: prepRef.id, analyzerVersion: deterministicMockPreparationAnalyzer.version });
    });
    const result = validatePreparationAnalysis(await deterministicMockPreparationAnalyzer.analyze({
      preparationId: prepRef.id, uploadId, fileName: upload.originalFileName, mimeType: upload.mimeType,
      lessonTitle: preparation.lessonTitle || null, subjectName: preparation.subjectName || null, objective: preparation.objective || null
    }));
    await db().runTransaction(async transaction => {
      transaction.create(analysisRef, {
        id: analysisId, schoolId, preparationId: prepRef.id, uploadId, analyzerVersion: deterministicMockPreparationAnalyzer.version,
        schemaVersion: result.schemaVersion, status: 'succeeded', result, createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid
      });
      transaction.update(uploadRef, { status: 'analyzed', analysisId, analysisCompletedAt: FieldValue.serverTimestamp() });
      transaction.update(prepRef, { status: 'needs_review', analysisStatus: 'succeeded', currentAnalysisId: analysisId, extractedData: result, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
      audit(transaction, actor, schoolId, 'preparation_analysis_succeeded', 'preparationAnalysis', analysisId, { preparationId: prepRef.id, uploadId });
    });
    return { preparationId: prepRef.id, uploadId, analysisId, analysisStatus: 'succeeded', result };
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 200) : 'ANALYSIS_FAILED';
    await db().runTransaction(async transaction => {
      transaction.set(analysisRef, {
        id: analysisId, schoolId, preparationId: prepRef.id, uploadId, analyzerVersion: deterministicMockPreparationAnalyzer.version,
        schemaVersion: 'preparation-analysis-v1', status: 'failed', errorCode: reason,
        createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid
      });
      transaction.update(uploadRef, { status: 'analysis_failed', analysisId, analysisCompletedAt: FieldValue.serverTimestamp() });
      transaction.update(prepRef, { status: 'needs_review', analysisStatus: 'failed', currentAnalysisId: analysisId, analysisError: reason, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
      audit(transaction, actor, schoolId, 'preparation_analysis_failed', 'preparationAnalysis', analysisId, { preparationId: prepRef.id, uploadId, reason });
    });
    return { preparationId: prepRef.id, uploadId, analysisId, analysisStatus: 'failed', fallback: 'manual_review_required' };
  }
});

const reviewPayload = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') throw new functions.https.HttpsError('invalid-argument', 'Correction invalide.');
  const value = raw as Record<string, unknown>;
  return {
    lessonTitle: nullableText(value.lessonTitle, 500), objective: nullableText(value.objective), prerequisites: nullableText(value.prerequisites),
    materials: nullableText(value.materials), lessonSteps: nullableText(value.lessonSteps, 5000), assessment: nullableText(value.assessment), differentiation: nullableText(value.differentiation)
  };
};

export const saveLessonPreparationReview = functions.https.onCall(async (data, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, data?.schoolId);
  const preparationId = requireId(data?.preparationId, 'preparationId');
  const ref = db().collection('lessonPreparations').doc(preparationId);
  await db().runTransaction(async transaction => {
    const current = schoolDocument(await transaction.get(ref), schoolId, 'Préparation');
    if (!['uploaded', 'needs_review'].includes(current.status)) throw new functions.https.HttpsError('failed-precondition', 'Préparation non révisable.');
    transaction.update(ref, { status: 'needs_review', reviewData: reviewPayload(data?.review), reviewedAt: FieldValue.serverTimestamp(), reviewedBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    audit(transaction, actor, schoolId, 'preparation_review_saved', 'lessonPreparation', preparationId, { analysisStatus: current.analysisStatus });
  });
  return { preparationId, status: 'needs_review' };
});

export const validateLessonPreparation = functions.https.onCall(async (data, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, data?.schoolId);
  const preparationId = requireId(data?.preparationId, 'preparationId');
  const ref = db().collection('lessonPreparations').doc(preparationId);
  await db().runTransaction(async transaction => {
    const current = schoolDocument(await transaction.get(ref), schoolId, 'Préparation');
    if (current.status !== 'needs_review' || !current.reviewData) throw new functions.https.HttpsError('failed-precondition', 'Une relecture explicite est requise avant validation.');
    transaction.update(ref, {
      status: 'validated', validatedAt: FieldValue.serverTimestamp(), validatedBy: actor.uid,
      validationRecordedBy: actor.uid, validationMeaning: 'Le secrétariat atteste avoir relu et validé la préparation; aucune validation automatique n’est impliquée.',
      version: (current.version || 1) + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid
    });
    audit(transaction, actor, schoolId, 'preparation_validated', 'lessonPreparation', preparationId, { uploadId: current.currentUploadId || null, analysisId: current.currentAnalysisId || null });
  });
  return { preparationId, status: 'validated' };
});
