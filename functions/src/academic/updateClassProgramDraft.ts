import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { resolveAcademicYear, resolveClassProgram } from './academicResolvers';

type Data = Record<string, unknown>;
type SubjectInput = {
  subjectId: string;
  coefficient?: number;
  weeklyHours?: number;
  isRequired: boolean;
  isActive: boolean;
  displayOrder: number;
};

const MANAGER_ROLES = new Set(['superAdmin', 'owner', 'director']);
const MAX_SUBJECTS = 200;
const MAX_COEFFICIENT = 100;
const MAX_WEEKLY_HOURS = 80;

const failure = (code: functions.https.FunctionsErrorCode, message: string, businessCode: string) =>
  new functions.https.HttpsError(code, message, { businessCode });

const cleanId = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value.trim())) {
    throw failure('invalid-argument', `${field} est invalide.`, 'INVALID_ARGUMENT');
  }
  return value.trim();
};

const isLegacyActive = (data: Data): boolean =>
  data.active !== false && data.isActive !== false && data.status !== 'inactive' && data.status !== 'archived';

const isActiveActor = (data: Data): boolean =>
  data.active === true || data.isActive === true || data.status === 'active';

const optionalNumber = (value: unknown, field: string, maximum: number): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > maximum) {
    throw failure('invalid-argument', `${field} doit être un nombre strictement positif inférieur ou égal à ${maximum}.`, 'INVALID_CONFIGURATION');
  }
  return value;
};

const parseSubjects = (raw: unknown): SubjectInput[] => {
  if (!Array.isArray(raw) || raw.length > MAX_SUBJECTS) {
    throw failure('invalid-argument', 'La liste des matières est invalide.', 'INVALID_SUBJECTS');
  }
  const seen = new Set<string>();
  const subjects = raw.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw failure('invalid-argument', 'Une matière du programme est invalide.', 'INVALID_SUBJECT');
    }
    const item = entry as Data;
    const allowed = new Set(['subjectId', 'coefficient', 'weeklyHours', 'isRequired', 'isActive', 'displayOrder']);
    if (Object.keys(item).some(key => !allowed.has(key))) {
      throw failure('invalid-argument', 'La matière contient des champs non autorisés.', 'UNSUPPORTED_FIELDS');
    }
    const subjectId = cleanId(item.subjectId, 'subjectId');
    if (seen.has(subjectId)) throw failure('already-exists', 'Une matière est présente plusieurs fois.', 'DUPLICATE_SUBJECT');
    seen.add(subjectId);
    if (typeof item.isRequired !== 'boolean' || typeof item.isActive !== 'boolean') {
      throw failure('invalid-argument', 'isRequired et isActive sont obligatoires.', 'INVALID_SUBJECT');
    }
    if (!Number.isInteger(item.displayOrder) || Number(item.displayOrder) < 0) {
      throw failure('invalid-argument', 'L’ordre de matière est invalide.', 'INVALID_ORDER');
    }
    return {
      subjectId,
      coefficient: optionalNumber(item.coefficient, 'coefficient', MAX_COEFFICIENT),
      weeklyHours: optionalNumber(item.weeklyHours, 'weeklyHours', MAX_WEEKLY_HOURS),
      isRequired: item.isRequired,
      isActive: item.isActive,
      displayOrder: Number(item.displayOrder),
    };
  });
  const activeOrders = subjects.filter(subject => subject.isActive).map(subject => subject.displayOrder).sort((a, b) => a - b);
  if (activeOrders.some((order, index) => order !== index)) {
    throw failure('invalid-argument', 'L’ordre des matières actives doit être continu et déterministe.', 'INVALID_ORDER');
  }
  return subjects;
};

export const updateClassProgramDraft = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw failure('unauthenticated', 'Authentification requise.', 'UNAUTHENTICATED');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw failure('invalid-argument', 'Payload invalide.', 'INVALID_ARGUMENT');
  const payload = raw as Data;
  const allowed = new Set(['schoolId', 'academicYearId', 'classId', 'expectedDraftRevisionId', 'subjects']);
  if (Object.keys(payload).some(key => !allowed.has(key))) throw failure('invalid-argument', 'Payload non autorisé.', 'INVALID_ARGUMENT');

  const requestedSchoolId = cleanId(payload.schoolId, 'schoolId');
  const academicYearId = cleanId(payload.academicYearId, 'academicYearId');
  const classId = cleanId(payload.classId, 'classId');
  const expectedDraftRevisionId = cleanId(payload.expectedDraftRevisionId, 'expectedDraftRevisionId');
  const subjects = parseSubjects(payload.subjects);
  const uid = context.auth.uid;
  const db = admin.firestore();
  const actorSnap = await db.collection('users').doc(uid).get();
  const actor = actorSnap.data() as Data | undefined;
  if (!actorSnap.exists || !actor || !isActiveActor(actor)) throw failure('permission-denied', 'Compte opérateur actif requis.', 'PERMISSION_DENIED');
  const role = typeof actor.role === 'string' ? actor.role : '';
  if (!MANAGER_ROLES.has(role)) throw failure('permission-denied', 'Rôle non autorisé.', 'PERMISSION_DENIED');
  const actorSchoolId = typeof actor.schoolId === 'string' ? actor.schoolId.trim() : '';
  const schoolId = role === 'superAdmin' ? requestedSchoolId : actorSchoolId;
  if (!schoolId || schoolId !== requestedSchoolId) throw failure('permission-denied', 'Accès inter-école refusé.', 'SCHOOL_MISMATCH');
  const nowIso = new Date().toISOString();

  return db.runTransaction(async transaction => {
    const year = await resolveAcademicYear(transaction, db, schoolId, academicYearId);
    if (!isLegacyActive(year.data)) throw failure('failed-precondition', 'L’année scolaire doit être active.', 'YEAR_NOT_ACTIVE');
    const classRef = db.collection('classes').doc(classId);
    const classSnap = await transaction.get(classRef);
    const classData = classSnap.data() as Data | undefined;
    if (!classSnap.exists || !classData) throw failure('not-found', 'Classe introuvable.', 'CLASS_NOT_FOUND');
    if (classData.schoolId !== schoolId) throw failure('permission-denied', 'Accès inter-école refusé.', 'SCHOOL_MISMATCH');
    if (!isLegacyActive(classData)) throw failure('failed-precondition', 'La classe doit être active.', 'CLASS_NOT_ACTIVE');

    const resolved = await resolveClassProgram(transaction, db, schoolId, classId, year);
    if (!resolved) throw failure('not-found', 'Programme introuvable.', 'PROGRAM_NOT_FOUND');
    const program = resolved.data as Data;
    if (program.schoolId !== schoolId || program.classId !== classId || program.academicYearId !== year.id) {
      throw failure('failed-precondition', 'Le programme est incohérent.', 'PROGRAM_INTEGRITY_ERROR');
    }
    if (program.hasUnpublishedChanges !== true || program.draftRevisionId !== expectedDraftRevisionId) {
      throw failure('aborted', 'Le brouillon a changé. Rechargez la page.', 'DRAFT_CHANGED');
    }
    if (program.publishedRevisionId === expectedDraftRevisionId) {
      throw failure('failed-precondition', 'Une révision publiée est immuable.', 'PUBLISHED_IMMUTABLE');
    }

    const subjectCatalogSnaps = await Promise.all(subjects.map(subject => transaction.get(db.collection('subjects').doc(subject.subjectId))));
    const catalog = new Map<string, Data>();
    subjectCatalogSnaps.forEach((snapshot, index) => {
      const data = snapshot.data() as Data | undefined;
      if (!snapshot.exists || !data) throw failure('not-found', 'Matière introuvable.', 'SUBJECT_NOT_FOUND');
      if (data.schoolId !== schoolId) throw failure('permission-denied', 'Accès inter-école refusé.', 'SCHOOL_MISMATCH');
      if (!isLegacyActive(data)) throw failure('failed-precondition', 'Une matière inactive ne peut pas être ajoutée.', 'SUBJECT_NOT_ACTIVE');
      if (typeof data.name !== 'string' || !data.name.trim()) throw failure('failed-precondition', 'Le libellé de matière est invalide.', 'SUBJECT_INTEGRITY_ERROR');
      catalog.set(subjects[index].subjectId, data);
    });
    const existingSnap = await transaction.get(db.collection('classSubjects').where('programId', '==', resolved.id).where('revisionId', '==', expectedDraftRevisionId));
    const submitted = new Set(subjects.map(subject => subject.subjectId));
    for (const document of existingSnap.docs) {
      const existing = document.data();
      if (!submitted.has(String(existing.subjectId)) && existing.isActive === true) {
        transaction.update(document.ref, { isActive: false, updatedAt: nowIso, updatedBy: uid });
      }
    }
    for (const subject of subjects) {
      const source = catalog.get(subject.subjectId)!;
      const documentId = `${expectedDraftRevisionId}__${subject.subjectId}`;
      const ref = db.collection('classSubjects').doc(documentId);
      const payload: Data = {
        id: documentId, programId: resolved.id, schoolId, classId, academicYearId: year.id,
        subjectId: subject.subjectId, revisionId: expectedDraftRevisionId,
        revisionNumber: program.draftRevisionNumber, subjectNameSnapshot: String(source.name).trim(),
        isRequired: subject.isRequired, isActive: subject.isActive, displayOrder: subject.displayOrder,
        updatedAt: nowIso, updatedBy: uid,
        ...(program.testFixture === true ? { testFixture: true, testRunId: program.testRunId } : {}),
      };
      if (typeof source.code === 'string' && source.code.trim()) payload.subjectCodeSnapshot = source.code.trim();
      if (subject.coefficient !== undefined) payload.coefficient = subject.coefficient;
      if (subject.weeklyHours !== undefined) payload.weeklyHours = subject.weeklyHours;
      const prior = existingSnap.docs.find(document => document.id === documentId);
      if (prior) {
        if (subject.coefficient === undefined) payload.coefficient = admin.firestore.FieldValue.delete();
        if (subject.weeklyHours === undefined) payload.weeklyHours = admin.firestore.FieldValue.delete();
        transaction.update(ref, payload);
      } else {
        transaction.create(ref, { ...payload, createdAt: nowIso, createdBy: uid });
      }
    }
    const nextVersion = Number(program.version || 0) + 1;
    transaction.update(db.collection('classPrograms').doc(resolved.id), { updatedAt: nowIso, updatedBy: uid, version: nextVersion });
    transaction.create(db.collection('audit_logs').doc(), {
      schoolId, action: 'CLASS_PROGRAM_UPDATED', actorUid: uid, actorRole: role,
      targetType: 'classProgram', targetId: resolved.id,
      details: { academicYearId: year.id, classId, revisionId: expectedDraftRevisionId, subjectCount: subjects.filter(subject => subject.isActive).length, version: nextVersion },
      timestamp: nowIso, createdAt: nowIso, canonicalBackendAudit: true,
      ...(program.testFixture === true ? { testFixture: true, testRunId: program.testRunId } : {}),
    });
    return { success: true, programId: resolved.id, draftRevisionId: expectedDraftRevisionId, version: nextVersion, subjectCount: subjects.filter(subject => subject.isActive).length };
  });
});
