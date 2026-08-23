import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;
type Action = 'CREATE' | 'UPDATE' | 'OPEN' | 'CLOSE';

const MANAGER_ROLES = new Set(['superAdmin', 'owner', 'director']);
const PERIOD_TYPES = new Set(['term', 'semester', 'sequence', 'custom']);
const PROFILE_FIELDS = new Set(['name', 'type', 'order', 'startDate', 'endDate', 'testFixture', 'testRunId']);

const failure = (code: functions.https.FunctionsErrorCode, message: string, businessCode: string) =>
  new functions.https.HttpsError(code, message, { businessCode });

const object = (value: unknown, field: string): Data => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw failure('invalid-argument', `${field} doit être un objet.`, 'INVALID_ARGUMENT');
  }
  return value as Data;
};

const id = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.trim())) {
    throw failure('invalid-argument', `${field} est invalide.`, 'INVALID_ARGUMENT');
  }
  return value.trim();
};

const dateOnly = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw failure('invalid-argument', `${field} doit être au format YYYY-MM-DD.`, 'INVALID_DATE');
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw failure('invalid-argument', `${field} est invalide.`, 'INVALID_DATE');
  }
  return value;
};

const activeUser = (user: Data): boolean =>
  user.active === true || user.isActive === true || user.status === 'active';

const profile = (raw: unknown): Data => {
  const input = object(raw, 'profile');
  const unsupported = Object.keys(input).filter(key => !PROFILE_FIELDS.has(key));
  if (unsupported.length) {
    throw failure('invalid-argument', `Champs de période non autorisés: ${unsupported.join(', ')}.`, 'UNSUPPORTED_FIELDS');
  }
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120) {
    throw failure('invalid-argument', 'Le nom de la période est requis.', 'INVALID_NAME');
  }
  if (typeof input.type !== 'string' || !PERIOD_TYPES.has(input.type)) {
    throw failure('invalid-argument', 'Le type de période est invalide.', 'INVALID_TYPE');
  }
  if (!Number.isInteger(input.order) || Number(input.order) < 1 || Number(input.order) > 100) {
    throw failure('invalid-argument', 'L’ordre doit être un entier positif.', 'INVALID_ORDER');
  }
  const startDate = dateOnly(input.startDate, 'startDate');
  const endDate = dateOnly(input.endDate, 'endDate');
  if (startDate > endDate) {
    throw failure('invalid-argument', 'startDate doit précéder ou égaler endDate.', 'INVALID_DATE_RANGE');
  }
  const fixture = input.testFixture === true || input.testRunId !== undefined
    ? { testFixture: true, testRunId: id(input.testRunId, 'testRunId') }
    : {};
  if (input.testFixture !== undefined && input.testFixture !== true) {
    throw failure('invalid-argument', 'testFixture doit valoir true.', 'INVALID_FIXTURE');
  }
  return { name: input.name.trim(), type: input.type, order: input.order, startDate, endDate, ...fixture };
};

export const manageAcademicPeriod = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw failure('unauthenticated', 'Authentification requise.', 'UNAUTHENTICATED');
  const payload = object(raw, 'payload');
  const allowed = new Set(['action', 'periodId', 'schoolId', 'academicYearId', 'profile']);
  if (Object.keys(payload).some(key => !allowed.has(key))) {
    throw failure('invalid-argument', 'Payload de période non autorisé.', 'INVALID_ARGUMENT');
  }
  if (!['CREATE', 'UPDATE', 'OPEN', 'CLOSE'].includes(String(payload.action))) {
    throw failure('invalid-argument', 'Action de période invalide.', 'INVALID_ACTION');
  }
  const action = payload.action as Action;
  const academicYearId = id(payload.academicYearId, 'academicYearId');
  const db = admin.firestore();
  const uid = context.auth.uid;
  const actorSnap = await db.collection('users').doc(uid).get();
  const actor = actorSnap.data();
  if (!actorSnap.exists || !actor || !activeUser(actor)) {
    throw failure('permission-denied', 'Compte opérateur actif requis.', 'PERMISSION_DENIED');
  }
  const role = typeof actor.role === 'string' ? actor.role : '';
  if (!MANAGER_ROLES.has(role)) throw failure('permission-denied', 'Rôle non autorisé.', 'PERMISSION_DENIED');
  const actorSchoolId = typeof actor.schoolId === 'string' ? actor.schoolId.trim() : '';
  const requestedSchoolId = payload.schoolId === undefined ? '' : id(payload.schoolId, 'schoolId');
  const schoolId = role === 'superAdmin' ? requestedSchoolId : actorSchoolId;
  if (!schoolId || (role !== 'superAdmin' && requestedSchoolId && requestedSchoolId !== schoolId)) {
    throw failure('permission-denied', 'École cible non autorisée.', 'SCHOOL_MISMATCH');
  }
  const periodRef = action === 'CREATE'
    ? db.collection('periods').doc()
    : db.collection('periods').doc(id(payload.periodId, 'periodId'));
  const parsedProfile = action === 'CREATE' || action === 'UPDATE' ? profile(payload.profile) : {};
  if (process.env.GCLOUD_PROJECT === 'ecoscolaire-c5861' && parsedProfile.testFixture === true) {
    if (actor.testFixture !== true || actor.testRunId !== parsedProfile.testRunId) {
      throw failure('permission-denied', 'Fixture Production non autorisée.', 'FIXTURE_FORBIDDEN');
    }
  }
  const yearRef = db.collection('academicYears').doc(academicYearId);
  const nowIso = new Date().toISOString();

  return db.runTransaction(async transaction => {
    const [yearSnap, periodSnap, periodsSnap] = await Promise.all([
      transaction.get(yearRef),
      transaction.get(periodRef),
      transaction.get(db.collection('periods').where('academicYearId', '==', academicYearId)),
    ]);
    if (!yearSnap.exists) throw failure('not-found', 'Année académique introuvable.', 'YEAR_NOT_FOUND');
    const year = yearSnap.data() as Data;
    if (year.schoolId !== schoolId) throw failure('permission-denied', 'Accès inter-école refusé.', 'SCHOOL_MISMATCH');
    if (year.status !== 'active') throw failure('failed-precondition', 'L’année académique doit être active.', 'YEAR_NOT_ACTIVE');
    const existing = periodSnap.data() as Data | undefined;
    if (action === 'CREATE' && periodSnap.exists) throw failure('already-exists', 'Période déjà existante.', 'PERIOD_EXISTS');
    if (action !== 'CREATE' && (!periodSnap.exists || !existing)) throw failure('not-found', 'Période introuvable.', 'PERIOD_NOT_FOUND');
    if (existing && (existing.schoolId !== schoolId || existing.academicYearId !== academicYearId)) {
      throw failure('permission-denied', 'Accès inter-école refusé.', 'SCHOOL_MISMATCH');
    }

    if (action === 'CREATE' || action === 'UPDATE') {
      if (action === 'UPDATE' && existing?.status !== 'draft') {
        throw failure('failed-precondition', 'Seule une période brouillon peut être modifiée.', 'INVALID_STATUS');
      }
      if (String(parsedProfile.startDate) < String(year.startDate) || String(parsedProfile.endDate) > String(year.endDate)) {
        throw failure('failed-precondition', 'La période doit rester dans les bornes de l’année.', 'OUT_OF_YEAR_BOUNDS');
      }
      for (const docSnap of periodsSnap.docs) {
        if (docSnap.id === periodRef.id) continue;
        const other = docSnap.data();
        if (other.schoolId !== schoolId || other.status === 'archived') continue;
        if (other.order === parsedProfile.order) {
          throw failure('already-exists', 'Cet ordre est déjà utilisé.', 'DUPLICATE_ORDER');
        }
        if (String(parsedProfile.startDate) <= String(other.endDate) && String(parsedProfile.endDate) >= String(other.startDate)) {
          throw failure('failed-precondition', 'Les périodes d’évaluation ne peuvent pas se chevaucher.', 'PERIOD_OVERLAP');
        }
      }
    }

    const previousStatus = existing?.status;
    let newStatus: unknown = previousStatus;
    let canonical: Data;
    if (action === 'CREATE') {
      newStatus = 'draft';
      canonical = {
        id: periodRef.id, schoolId, academicYearId, ...parsedProfile, status: 'draft', version: 1,
        createdAt: nowIso, createdBy: uid, updatedAt: nowIso, updatedBy: uid,
      };
      transaction.set(periodRef, { ...canonical, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    } else if (action === 'UPDATE') {
      canonical = { ...existing, ...parsedProfile, updatedAt: nowIso, updatedBy: uid, version: Number(existing?.version || 0) + 1 };
      transaction.update(periodRef, { ...parsedProfile, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, version: canonical.version });
    } else if (action === 'OPEN') {
      if (existing?.status === 'closed') throw failure('failed-precondition', 'Une période fermée ne peut pas être rouverte.', 'CLOSED_PERIOD_IMMUTABLE');
      if (existing?.status !== 'draft') throw failure('failed-precondition', 'Seule une période brouillon peut être ouverte.', 'INVALID_STATUS');
      const conflicting = periodsSnap.docs.find(docSnap => docSnap.id !== periodRef.id && docSnap.data().schoolId === schoolId && docSnap.data().status === 'open');
      if ((year.openPeriodId && year.openPeriodId !== periodRef.id) || conflicting) {
        throw failure('failed-precondition', 'Fermez la période ouverte avant d’en ouvrir une autre.', 'OPEN_PERIOD_EXISTS');
      }
      newStatus = 'open';
      canonical = { ...existing, status: 'open', updatedAt: nowIso, updatedBy: uid, version: Number(existing?.version || 0) + 1 };
      transaction.update(periodRef, { status: 'open', updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, version: canonical.version });
      transaction.update(yearRef, { openPeriodId: periodRef.id, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, version: Number(year.version || 0) + 1 });
    } else {
      if (existing?.status !== 'open') throw failure('failed-precondition', 'Seule une période ouverte peut être fermée.', 'INVALID_STATUS');
      newStatus = 'closed';
      canonical = { ...existing, status: 'closed', updatedAt: nowIso, updatedBy: uid, version: Number(existing?.version || 0) + 1 };
      transaction.update(periodRef, { status: 'closed', updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, version: canonical.version });
      if (year.openPeriodId === periodRef.id) {
        transaction.update(yearRef, { openPeriodId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, version: Number(year.version || 0) + 1 });
      }
    }

    const fixtureSource = parsedProfile.testFixture === true ? parsedProfile : existing;
    const auditAction: Record<Action, string> = {
      CREATE: 'ACADEMIC_PERIOD_CREATED', UPDATE: 'ACADEMIC_PERIOD_UPDATED',
      OPEN: 'ACADEMIC_PERIOD_OPENED', CLOSE: 'ACADEMIC_PERIOD_CLOSED',
    };
    const audit = {
      schoolId, action: auditAction[action], actorUid: uid, actorRole: role,
      targetType: 'academicPeriod', targetId: periodRef.id,
      details: { academicYearId, previousStatus: previousStatus ?? null, newStatus },
      timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), canonicalBackendAudit: true,
      ...(fixtureSource?.testFixture === true ? { testFixture: true, testRunId: fixtureSource.testRunId } : {}),
    };
    transaction.set(db.collection('audit_logs').doc(), audit);
    return { success: true, period: canonical, academicYear: { id: academicYearId, openPeriodId: action === 'OPEN' ? periodRef.id : action === 'CLOSE' ? null : year.openPeriodId } };
  });
});
