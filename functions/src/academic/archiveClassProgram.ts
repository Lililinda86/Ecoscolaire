import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { resolveAcademicYear, resolveClassProgram } from './academicResolvers';

type Data = Record<string, unknown>;
const MANAGER_ROLES = new Set(['superAdmin', 'owner', 'director']);
const failure = (code: functions.https.FunctionsErrorCode, message: string, businessCode: string) =>
  new functions.https.HttpsError(code, message, { businessCode });
const cleanId = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value.trim())) throw failure('invalid-argument', `${field} est invalide.`, 'INVALID_ARGUMENT');
  return value.trim();
};

export const archiveClassProgram = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw failure('unauthenticated', 'Authentification requise.', 'UNAUTHENTICATED');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw failure('invalid-argument', 'Payload invalide.', 'INVALID_ARGUMENT');
  const payload = raw as Data;
  const allowed = new Set(['schoolId', 'academicYearId', 'classId', 'expectedPublishedRevisionId']);
  if (Object.keys(payload).some(key => !allowed.has(key))) throw failure('invalid-argument', 'Payload non autorisé.', 'INVALID_ARGUMENT');
  const requestedSchoolId = cleanId(payload.schoolId, 'schoolId');
  const academicYearId = cleanId(payload.academicYearId, 'academicYearId');
  const classId = cleanId(payload.classId, 'classId');
  const expectedPublishedRevisionId = cleanId(payload.expectedPublishedRevisionId, 'expectedPublishedRevisionId');
  const uid = context.auth.uid;
  const db = admin.firestore();
  const actorSnap = await db.collection('users').doc(uid).get();
  const actor = actorSnap.data() as Data | undefined;
  if (!actorSnap.exists || !actor || !(actor.active === true || actor.isActive === true || actor.status === 'active')) throw failure('permission-denied', 'Compte opérateur actif requis.', 'PERMISSION_DENIED');
  const role = typeof actor.role === 'string' ? actor.role : '';
  if (!MANAGER_ROLES.has(role)) throw failure('permission-denied', 'Rôle non autorisé.', 'PERMISSION_DENIED');
  const actorSchoolId = typeof actor.schoolId === 'string' ? actor.schoolId.trim() : '';
  const schoolId = role === 'superAdmin' ? requestedSchoolId : actorSchoolId;
  if (!schoolId || schoolId !== requestedSchoolId) throw failure('permission-denied', 'Accès inter-école refusé.', 'SCHOOL_MISMATCH');
  const nowIso = new Date().toISOString();

  return db.runTransaction(async transaction => {
    const year = await resolveAcademicYear(transaction, db, schoolId, academicYearId);
    const resolved = await resolveClassProgram(transaction, db, schoolId, classId, year);
    if (!resolved) throw failure('not-found', 'Programme introuvable.', 'PROGRAM_NOT_FOUND');
    const program = resolved.data as Data;
    if (program.status !== 'published' || program.hasUnpublishedChanges !== false || program.publishedRevisionId !== expectedPublishedRevisionId) {
      throw failure('failed-precondition', 'Seul le programme publié courant peut être archivé.', 'INVALID_STATUS');
    }
    const version = Number(program.version || 0) + 1;
    transaction.update(db.collection('classPrograms').doc(resolved.id), {
      status: 'archived', archivedAt: nowIso, archivedBy: uid, updatedAt: nowIso, updatedBy: uid, version,
    });
    transaction.create(db.collection('audit_logs').doc(), {
      schoolId, action: 'CLASS_PROGRAM_ARCHIVED', actorUid: uid, actorRole: role,
      targetType: 'classProgram', targetId: resolved.id,
      details: { academicYearId: year.id, classId, revisionId: expectedPublishedRevisionId, version },
      timestamp: nowIso, createdAt: nowIso, canonicalBackendAudit: true,
      ...(program.testFixture === true ? { testFixture: true, testRunId: program.testRunId } : {}),
    });
    return { success: true, programId: resolved.id, status: 'archived', version };
  });
});
