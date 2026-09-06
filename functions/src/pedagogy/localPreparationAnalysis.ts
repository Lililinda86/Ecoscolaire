import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { audit, requireId, requirePedagogyActor } from './authorization';
import { scopedDocument } from './scopes';
import { deterministicMockPreparationAnalyzer, validatePreparationAnalysis } from './preparationAnalyzer';
import { permitsDemoPreparationAnalysis, verifyPreparationBytes } from './preparationFileIntegrity';

// No document is sent to an external service here. Real OCR/provider processing
// remains blocked pending specific authorization, secure configuration and tests.
export const startLessonPreparationAnalysis = functions.runWith({ timeoutSeconds: 120, memory: '512MB' }).https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId);
  const uploadId = requireId(raw?.uploadId, 'uploadId'), db = admin.firestore();
  const uploadRef = db.collection('preparationUploads').doc(uploadId);
  const upload = scopedDocument(await uploadRef.get(), schoolId, 'Dépôt');
  const prepRef = db.collection('lessonPreparations').doc(upload.preparationId);
  const demo = permitsDemoPreparationAnalysis({ emulator: process.env.FUNCTIONS_EMULATOR, projectId: admin.app().options.projectId || process.env.GCLOUD_PROJECT });
  const analyzerVersion = demo ? 'mock-preparation-file-check-v2' : 'file-integrity-only-v2';
  const claim = await db.runTransaction(async transaction => {
    const [freshUpload, prepSnap] = await Promise.all([transaction.get(uploadRef), transaction.get(prepRef)]);
    const current = scopedDocument(freshUpload, schoolId, 'Dépôt'), prep = scopedDocument(prepSnap, schoolId, 'Préparation');
    if (prep.currentUploadId !== uploadId || prep.status === 'validated') throw new functions.https.HttpsError('failed-precondition', 'Seul le dépôt courant non validé est analysable.');
    if (current.status === 'analyzed' && current.analyzerVersion === analyzerVersion) return { cached: true as const, analysisId: current.analysisId, preparation: prep, attempt: current.analysisAttempt || 1 };
    if (current.status === 'analyzing' && Number(current.analysisLeaseUntil) > Date.now()) throw new functions.https.HttpsError('aborted', 'Analyse déjà en cours.');
    if (['analysis_failed', 'analyzing'].includes(current.status) && raw.retry !== true) throw new functions.https.HttpsError('failed-precondition', 'Une reprise explicite est requise.');
    const attempt = Number(current.analysisAttempt || 0) + 1;
    if (attempt > 5) throw new functions.https.HttpsError('resource-exhausted', 'Cinq tentatives atteintes : poursuivez la relecture manuelle.');
    const analysisId = createHash('sha256').update(JSON.stringify([schoolId, uploadId, analyzerVersion, attempt])).digest('hex');
    transaction.update(uploadRef, { status: 'analyzing', analysisId, analyzerVersion, analysisAttempt: attempt, analysisLeaseUntil: Date.now() + 180000, analysisStartedAt: FieldValue.serverTimestamp() });
    transaction.update(prepRef, { analysisStatus: 'processing', analysisError: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    audit(transaction, actor, schoolId, 'preparation_analysis_started', 'preparationUpload', uploadId, { preparationId: prepRef.id, analyzerVersion, attempt });
    return { cached: false as const, analysisId, preparation: prep, attempt };
  });
  if (claim.cached) return { preparationId: prepRef.id, uploadId, analysisId: claim.analysisId, analysisStatus: 'succeeded', idempotent: true };
  let result: ReturnType<typeof validatePreparationAnalysis> | null = null, errorCode = '', integrity: ReturnType<typeof verifyPreparationBytes> | null = null;
  try {
    const file = admin.storage().bucket().file(upload.storagePath);
    const [metadata] = await file.getMetadata();
    if (metadata.contentType !== upload.mimeType || Number(metadata.size) !== upload.size || upload.size > 10 * 1024 * 1024 || metadata.metadata?.checksum !== upload.checksum || metadata.metadata?.preparationId !== upload.preparationId) throw new Error('UPLOAD_METADATA_MISMATCH');
    // Pin the storage generation checked above; custom metadata is not a hash proof.
    const [bytes] = await admin.storage().bucket().file(upload.storagePath, { generation: metadata.generation }).download();
    integrity = verifyPreparationBytes(bytes, { size: upload.size, checksum: upload.checksum, mimeType: upload.mimeType });
    if (!demo) throw new Error('AI_DOCUMENT_PROCESSING_REQUIRES_APPROVAL');
    result = validatePreparationAnalysis(await deterministicMockPreparationAnalyzer.analyze({ preparationId: prepRef.id, uploadId, fileName: upload.originalFileName, mimeType: upload.mimeType, lessonTitle: claim.preparation.lessonTitle || null, subjectName: claim.preparation.subjectName || null, objective: claim.preparation.objective || null }));
  } catch (error) {
    errorCode = error instanceof Error && /^(UPLOAD|MOCK|AI|INVALID_ANALYSIS)_[A-Z_]+$/.test(error.message) ? error.message : 'PREPARATION_FILE_CHECK_FAILED';
  }
  const analysisStatus = result ? 'succeeded' : 'failed';
  await db.runTransaction(async transaction => {
    const [currentUpload, currentPrep] = await Promise.all([transaction.get(uploadRef), transaction.get(prepRef)]);
    const fresh = scopedDocument(currentUpload, schoolId), prep = scopedDocument(currentPrep, schoolId);
    if (fresh.analysisId !== claim.analysisId) throw new functions.https.HttpsError('aborted', 'Tentative remplacée : résultat non appliqué.');
    const current = prep.currentUploadId === uploadId && prep.version === claim.preparation.version && prep.status !== 'validated';
    transaction.create(db.collection('preparationAnalyses').doc(claim.analysisId), {
      id: claim.analysisId, schoolId, preparationId: prepRef.id, uploadId, analyzerVersion, attempt: claim.attempt, schemaVersion: 'preparation-analysis-v1',
      status: analysisStatus, result, errorCode: errorCode || null, fileIntegrity: integrity, appliedToCurrentPreparation: current,
      processingMode: demo ? 'demo_mock' : 'local_integrity_only', createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid
    });
    transaction.update(uploadRef, { status: result ? 'analyzed' : 'analysis_failed', analysisLeaseUntil: 0, analysisCompletedAt: FieldValue.serverTimestamp() });
    if (current) transaction.update(prepRef, { status: 'needs_review', analysisStatus, currentAnalysisId: claim.analysisId, ...(result ? { extractedData: result, analysisError: FieldValue.delete() } : { analysisError: errorCode }), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    audit(transaction, actor, schoolId, `preparation_analysis_${analysisStatus}`, 'preparationAnalysis', claim.analysisId, { preparationId: prepRef.id, uploadId, analyzerVersion, errorCode: errorCode || null, appliedToCurrentPreparation: current });
  });
  return { preparationId: prepRef.id, uploadId, analysisId: claim.analysisId, analysisStatus, ...(result ? { result } : { fallback: 'manual_review_required', errorCode }) };
});
