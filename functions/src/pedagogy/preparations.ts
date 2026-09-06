import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { audit, requireId, requirePedagogyActor } from './authorization';
import { validDate } from './teachingEvidence';

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
    if (!validDate(weekStartDate)) throw new functions.https.HttpsError('invalid-argument', 'Date de semaine invalide.');
    const [yearSnap, classSnap, teacherSnap] = await Promise.all([
      db().collection('academicYears').doc(academicYearId).get(), db().collection('classes').doc(classId).get(), db().collection('staff').doc(teacherStaffId).get()
    ]);
    schoolDocument(yearSnap, schoolId, 'Année scolaire'); schoolDocument(classSnap, schoolId, 'Classe'); schoolDocument(teacherSnap, schoolId, 'Enseignant');
    const weeks = await db().collection('teachingWeeks').where('schoolId', '==', schoolId).where('academicYearId', '==', academicYearId).where('weekStartDate', '==', weekStartDate).limit(2).get();
    if (weeks.size !== 1 || weeks.docs[0].data().status !== 'open') throw new functions.https.HttpsError('failed-precondition', 'Une semaine pédagogique ouverte et unique est requise.');
    preparationId = manualPreparationId(schoolId, academicYearId, classId, subjectId, teacherStaffId, weekStartDate, checksum);
    preparation = {
      id: preparationId, schoolId, academicYearId, classId, subjectId, subjectName: text(data?.subjectName, 'subjectName', 200),
      teacherStaffId, weekStartDate, weekId: weeks.docs[0].id, weekEndDate: weeks.docs[0].data().weekEndDate,
      lessonTitle: nullableText(data?.lessonTitle, 500), objective: nullableText(data?.objective),
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
    if (existing.exists) {
      const upload = existing.data()!;
      if (upload.schoolId !== schoolId || upload.preparationId !== preparationId || upload.checksum !== checksum || upload.size !== size || upload.mimeType !== mimeType) throw new functions.https.HttpsError('already-exists', 'Un fichier différent utilise déjà cet identifiant.');
      return { preparationId, uploadId, storagePath: upload.storagePath, created: false };
    }
    const currentPrep = await transaction.get(prepRef);
    if (currentPrep.exists) {
      const current = schoolDocument(currentPrep, schoolId, 'Préparation');
      if (!['expected', 'uploaded'].includes(current.status) || current.analysisStatus === 'processing' || current.reviewData || current.teachingConfirmation) throw new functions.https.HttpsError('failed-precondition', 'Une préparation analysée, relue ou validée ne peut pas être remplacée. Conservez cette preuve et créez une nouvelle préparation pour le document corrigé.');
    }
    if (!currentPrep.exists) transaction.create(prepRef, { ...preparation, createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    transaction.create(uploadRef, {
      id: uploadId, schoolId, preparationId, academicYearId: preparation!.academicYearId, classId: preparation!.classId,
      storagePath, originalFileName, mimeType, size, checksum, immutable: true, status: 'awaiting_upload',
      createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid
    });
    transaction.set(prepRef, { status: 'uploaded', analysisStatus: 'pending', currentUploadId: uploadId, currentAnalysisId: FieldValue.delete(), extractedData: FieldValue.delete(), analysisError: FieldValue.delete(), version: (currentPrep.data()?.version || 1) + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
    audit(transaction, actor, schoolId, 'preparation_upload_registered', 'preparationUpload', uploadId, { preparationId, mimeType, size, checksum });
    return { preparationId, uploadId, storagePath, created: true };
  });
});

export { startLessonPreparationAnalysis } from './localPreparationAnalysis';

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
    if (!['uploaded', 'needs_review'].includes(current.status) || current.analysisStatus === 'processing') throw new functions.https.HttpsError('failed-precondition', 'Préparation non révisable pendant une analyse en cours.');
    transaction.update(ref, { status: 'needs_review', reviewData: reviewPayload(data?.review), version: (current.version || 1) + 1, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
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
