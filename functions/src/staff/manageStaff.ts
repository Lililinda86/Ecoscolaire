import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;
type StaffAction = 'CREATE' | 'UPDATE' | 'DEACTIVATE' | 'REACTIVATE';

const MANAGEMENT_ROLES = new Set(['superAdmin', 'owner', 'director', 'secretary']);
const STAFF_TYPES = new Set([
  'teacher', 'director', 'secretary', 'accountant', 'supervisor',
  'driver', 'maintenance', 'other',
]);
const EMPLOYMENT_STATUSES = new Set(['active', 'inactive', 'suspended', 'departed']);
const PROFILE_FIELDS = new Set([
  'firstName', 'lastName', 'phone', 'email', 'staffType', 'employmentStatus',
  'teachingEnabled', 'hireDate', 'departureDate', 'departureReason',
  'testFixture', 'testRunId',
]);

const error = (
  code: functions.https.FunctionsErrorCode,
  message: string,
  businessCode: string,
): functions.https.HttpsError => new functions.https.HttpsError(code, message, { businessCode });

const plainObject = (value: unknown, field: string): Data => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw error('invalid-argument', `${field} doit être un objet.`, 'INVALID_ARGUMENT');
  }
  return value as Data;
};

const optionalText = (value: unknown, field: string, max: number): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw error('invalid-argument', `${field} est invalide.`, 'INVALID_ARGUMENT');
  }
  const clean = value.trim();
  // eslint-disable-next-line no-control-regex
  if (!clean || clean.length > max || /[\u0000-\u001f\u007f]/.test(clean)) {
    throw error('invalid-argument', `${field} est invalide.`, 'INVALID_ARGUMENT');
  }
  return clean;
};

const requiredId = (value: unknown, field: string): string => {
  const clean = optionalText(value, field, 128);
  if (!clean || clean.includes('/')) {
    throw error('invalid-argument', `${field} est invalide.`, 'INVALID_ARGUMENT');
  }
  return clean;
};

const isActiveUser = (user: Data): boolean =>
  user.active === true || user.isActive === true || user.status === 'active';

const parseProfile = (raw: unknown, action: StaffAction): Data => {
  const profile = plainObject(raw, 'profile');
  const unsupported = Object.keys(profile).filter(key => !PROFILE_FIELDS.has(key));
  if (unsupported.length) {
    throw error(
      'invalid-argument',
      `Champs Staff non autorisés: ${unsupported.join(', ')}.`,
      'UNSUPPORTED_STAFF_FIELDS',
    );
  }

  const output: Data = {};
  const textFields: Array<[string, number]> = [
    ['firstName', 120], ['lastName', 120], ['phone', 40], ['email', 254],
    ['hireDate', 10], ['departureDate', 10], ['departureReason', 300],
  ];
  for (const [field, max] of textFields) {
    if (!(field in profile)) continue;
    const clean = optionalText(profile[field], field, max);
    output[field] = clean ?? '';
  }

  if ('staffType' in profile) {
    if (typeof profile.staffType !== 'string' || !STAFF_TYPES.has(profile.staffType)) {
      throw error('invalid-argument', 'staffType est invalide.', 'INVALID_STAFF_TYPE');
    }
    output.staffType = profile.staffType;
  }
  if ('employmentStatus' in profile) {
    if (typeof profile.employmentStatus !== 'string' || !EMPLOYMENT_STATUSES.has(profile.employmentStatus)) {
      throw error('invalid-argument', 'employmentStatus est invalide.', 'INVALID_EMPLOYMENT_STATUS');
    }
    output.employmentStatus = profile.employmentStatus;
  }
  if ('teachingEnabled' in profile) {
    if (typeof profile.teachingEnabled !== 'boolean') {
      throw error('invalid-argument', 'teachingEnabled est invalide.', 'INVALID_ARGUMENT');
    }
    output.teachingEnabled = profile.teachingEnabled;
  }

  if ('testFixture' in profile || 'testRunId' in profile) {
    if (profile.testFixture !== true) {
      throw error('invalid-argument', 'testFixture doit valoir true.', 'INVALID_FIXTURE');
    }
    output.testFixture = true;
    output.testRunId = requiredId(profile.testRunId, 'testRunId');
    if (process.env.GCLOUD_PROJECT === 'ecoscolaire-c5861') {
      throw error('permission-denied', 'Fixtures interdites en Production.', 'FIXTURE_FORBIDDEN');
    }
  }

  if (action === 'CREATE') {
    if (!output.firstName || !output.lastName) {
      throw error('invalid-argument', 'Le nom et le prénom sont requis.', 'INVALID_ARGUMENT');
    }
    output.staffType = output.staffType ?? 'other';
    output.employmentStatus = output.employmentStatus ?? 'active';
  }
  if (output.employmentStatus === 'departed' && !output.departureDate) {
    throw error('invalid-argument', 'La date de départ est requise.', 'DEPARTURE_DATE_REQUIRED');
  }
  return output;
};

export const manageStaff = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) {
    throw error('unauthenticated', 'Authentification requise.', 'UNAUTHENTICATED');
  }

  const payload = plainObject(raw, 'payload');
  const allowedPayloadFields = new Set(['action', 'staffId', 'schoolId', 'profile']);
  const unexpected = Object.keys(payload).filter(key => !allowedPayloadFields.has(key));
  if (unexpected.length) {
    throw error('invalid-argument', 'Payload Staff non autorisé.', 'INVALID_ARGUMENT');
  }
  if (!['CREATE', 'UPDATE', 'DEACTIVATE', 'REACTIVATE'].includes(String(payload.action))) {
    throw error('invalid-argument', 'Action Staff invalide.', 'INVALID_ACTION');
  }
  const action = payload.action as StaffAction;
  const uid = context.auth.uid;
  const db = admin.firestore();
  const actorSnap = await db.collection('users').doc(uid).get();
  const actor = actorSnap.data();
  if (!actorSnap.exists || !actor || !isActiveUser(actor)) {
    throw error('permission-denied', 'Compte opérateur actif requis.', 'PERMISSION_DENIED');
  }
  const role = typeof actor.role === 'string' ? actor.role : '';
  if (!MANAGEMENT_ROLES.has(role)) {
    throw error('permission-denied', 'Rôle non autorisé.', 'PERMISSION_DENIED');
  }

  const actorSchoolId = typeof actor.schoolId === 'string' ? actor.schoolId.trim() : '';
  const requestedSchoolId = payload.schoolId === undefined
    ? ''
    : requiredId(payload.schoolId, 'schoolId');
  const schoolId = role === 'superAdmin' ? requestedSchoolId : actorSchoolId;
  if (!schoolId || (role !== 'superAdmin' && requestedSchoolId && requestedSchoolId !== schoolId)) {
    throw error('permission-denied', 'École cible non autorisée.', 'SCHOOL_MISMATCH');
  }

  const staffRef = action === 'CREATE'
    ? db.collection('staff').doc()
    : db.collection('staff').doc(requiredId(payload.staffId, 'staffId'));
  const profile = action === 'CREATE' || action === 'UPDATE'
    ? parseProfile(payload.profile, action)
    : {};
  const auditRef = db.collection('audit_logs').doc();
  const nowIso = new Date().toISOString();

  try {
    return await db.runTransaction(async transaction => {
    const existingSnap = await transaction.get(staffRef);
    const existing = existingSnap.data();
    if (action === 'CREATE' && existingSnap.exists) {
      throw error('already-exists', 'La fiche Staff existe déjà.', 'STAFF_ALREADY_EXISTS');
    }
    if (action !== 'CREATE' && (!existingSnap.exists || !existing)) {
      throw error('not-found', 'Fiche Staff introuvable.', 'STAFF_NOT_FOUND');
    }
    if (existing && existing.schoolId !== schoolId) {
      throw error('permission-denied', 'La fiche Staff appartient à une autre école.', 'SCHOOL_MISMATCH');
    }

    const auditAction = action === 'CREATE'
      ? 'STAFF_CREATED'
      : action === 'UPDATE'
        ? 'STAFF_UPDATED'
        : action === 'DEACTIVATE'
          ? 'STAFF_DEACTIVATED'
          : 'STAFF_REACTIVATED';
    const mutation: Data = action === 'CREATE'
      ? {
          id: staffRef.id,
          schoolId,
          ...profile,
          isActive: profile.employmentStatus !== 'inactive',
          createdAt: FieldValue.serverTimestamp(),
          createdBy: uid,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        }
      : action === 'UPDATE'
        ? {
            ...profile,
            ...(profile.employmentStatus
              ? { isActive: profile.employmentStatus === 'active' }
              : {}),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: uid,
          }
        : action === 'DEACTIVATE'
          ? {
              employmentStatus: 'inactive',
              isActive: false,
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: uid,
              deactivatedAt: FieldValue.serverTimestamp(),
              deactivatedBy: uid,
            }
          : {
              employmentStatus: 'active',
              isActive: true,
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: uid,
              reactivatedAt: FieldValue.serverTimestamp(),
              reactivatedBy: uid,
            };

    if (action === 'CREATE') transaction.create(staffRef, mutation);
    else transaction.update(staffRef, mutation);

    const fixture = (profile.testFixture === true || existing?.testFixture === true)
      ? {
          testFixture: true,
          testRunId: String(profile.testRunId ?? existing?.testRunId ?? ''),
        }
      : {};
    transaction.create(auditRef, {
      actorUid: uid,
      actorRole: role,
      schoolId,
      action: auditAction,
      createdAt: FieldValue.serverTimestamp(),
      timestamp: nowIso,
      targetType: 'STAFF',
      targetId: staffRef.id,
      targetName: `staff/${staffRef.id}`,
      details: {},
      canonicalBackendAudit: true,
      ...fixture,
    });

    return {
      staffId: staffRef.id,
      schoolId,
      action,
      employmentStatus: action === 'DEACTIVATE'
        ? 'inactive'
        : action === 'REACTIVATE'
          ? 'active'
          : String(profile.employmentStatus ?? existing?.employmentStatus ?? 'active'),
      isActive: action === 'DEACTIVATE'
        ? false
        : action === 'REACTIVATE'
          ? true
          : profile.employmentStatus
            ? profile.employmentStatus === 'active'
            : existing?.isActive !== false,
    };
    });
  } catch (err: unknown) {
    if (err instanceof functions.https.HttpsError) throw err;
    const technical = err as { name?: string; message?: string; code?: string | number };
    console.error('manageStaff transaction failed', {
      action,
      errorName: technical?.name ?? 'UnknownError',
      errorCode: technical?.code ?? 'unknown',
      errorMessage: technical?.message ?? String(err),
    });
    throw error('internal', 'La mutation Staff a échoué.', 'INTERNAL_ERROR');
  }
});
