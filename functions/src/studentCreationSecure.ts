import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';

type InputMap = Record<string, unknown>;

export interface CreateStudentSecureInput {
  studentId: string;
  requestedMatricule?: string;
  confirmProbableDuplicate?: boolean;
  studentData: InputMap;
  privateData: InputMap;
  financeData: InputMap;
  parentPrivateData: InputMap;
  parentFinanceData: InputMap;
}

export interface CreateStudentSecureResult {
  studentId: string;
  matricule: string;
  matriculeNormalized: string;
  matriculeReservationId: string;
  duplicateFingerprint: string;
  duplicateReservationId: string;
  academicYearId: string;
  registrationYear: string;
  created: boolean;
}

const ALLOWED_ROLES = new Set(['superAdmin', 'owner', 'director', 'secretary']);
const MAX_AUTOMATIC_ATTEMPTS = 8;

const businessError = (
  code: functions.https.FunctionsErrorCode,
  businessCode: string,
  message: string
): functions.https.HttpsError => new functions.https.HttpsError(code, message, { businessCode });

const requireMap = (value: unknown, field: string): InputMap => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw businessError('invalid-argument', 'INVALID_ARGUMENT', `${field} invalide.`);
  }
  return value as InputMap;
};

const requireSafeId = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || value.includes('/')) {
    throw businessError('invalid-argument', 'INVALID_ARGUMENT', `${field} invalide.`);
  }
  return value.trim();
};

const requireString = (value: unknown, field: string, maxLength = 300): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw businessError('invalid-argument', 'INVALID_ARGUMENT', `${field} invalide.`);
  }
  return value.trim();
};

const normalizeIdentityPart = (value: string): string => value
  .trim()
  .toUpperCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export const normalizeSecureStudentMatricule = (value: string): string => {
  const normalized = normalizeIdentityPart(value);
  if (!normalized || normalized.length > 64) {
    throw businessError('invalid-argument', 'INVALID_MATRICULE', 'Matricule invalide.');
  }
  return normalized;
};

export const buildSecureStudentFingerprint = (studentData: InputMap, privateData: InputMap): string => {
  const lastName = normalizeIdentityPart(requireString(studentData.studentLastName, 'studentLastName', 120));
  const firstName = normalizeIdentityPart(requireString(studentData.studentFirstName, 'studentFirstName', 120));
  const dob = requireString(privateData.dob, 'dob', 10);
  const gender = requireString(studentData.gender, 'gender', 10).toUpperCase();
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dob) || !['M', 'F'].includes(gender)) {
    throw businessError('invalid-argument', 'INVALID_ARGUMENT', 'Identité élève invalide.');
  }
  return `${lastName}__${firstName}__${dob}__${gender}`;
};

const generateAutomaticMatricule = (studentId: string, attempt: number): string => {
  const digest = crypto.createHash('sha256').update(`${studentId}:${attempt}`).digest('hex');
  return `MAT-2026-${1000 + (Number.parseInt(digest.slice(0, 8), 16) % 9000)}`;
};

const configuredLimit = (school: InputMap): number => {
  if (school.isInternalSchool === true || school.subscriptionPlan === 'premium') return Infinity;
  if (typeof school.studentLimit === 'number' && Number.isSafeInteger(school.studentLimit) && school.studentLimit >= 0) {
    return school.studentLimit;
  }
  return school.subscriptionPlan === 'pilot' || school.subscriptionPlan === 'standard' ? 1000 : 200;
};

const canonicalCount = (school: InputMap): number | null =>
  typeof school.studentsCount === 'number'
  && Number.isSafeInteger(school.studentsCount)
  && school.studentsCount >= 0
    ? school.studentsCount
    : null;

const pick = (source: InputMap, keys: readonly string[]): InputMap => Object.fromEntries(
  keys.filter(key => source[key] !== undefined && source[key] !== '').map(key => [key, source[key]])
);

const STUDENT_KEYS = [
  'name', 'studentLastName', 'studentFirstName', 'gender', 'section', 'classId',
  'studentStatus', 'busId', 'usesTransport', 'transportFleet', 'transportStatus'
] as const;
const PRIVATE_KEYS = [
  'dob', 'placeOfBirth', 'parentName', 'parentPhone', 'parentEmails', 'address',
  'emergencyContact', 'allergies', 'medicalConditions', 'transportNeighborhood',
  'transportPickupPoint', 'transportZonePk', 'fatherName', 'fatherPhone', 'fatherProfession', 'motherName',
  'motherPhone', 'motherProfession', 'guardianRelationship', 'guardianRelationshipDetails',
  'motherLastName', 'motherFirstName', 'motherEmail', 'motherWhatsapp', 'fatherLastName',
  'fatherFirstName', 'fatherEmail', 'fatherWhatsapp', 'guardianLastName', 'guardianFirstName',
  'guardianPhone', 'guardianEmail', 'guardianWhatsapp', 'guardianRelation', 'primaryContactType'
] as const;
const FINANCE_KEYS = [
  'feeAmount', 'feeT1', 'feeT2', 'feeT3', 'feeTransport', 'feeUniforms',
  'financialBypass', 'registrationFeeExpected', 'tuitionExpected', 'transportMonthlyFee'
] as const;

const validateStudentPayload = (
  studentData: InputMap,
  privateData: InputMap,
  financeData: InputMap
): void => {
  requireString(studentData.name, 'name', 240);
  requireString(studentData.studentLastName, 'studentLastName', 120);
  requireString(studentData.studentFirstName, 'studentFirstName', 120);
  requireString(privateData.parentName, 'parentName', 240);
  requireString(privateData.parentPhone, 'parentPhone', 80);
  if (!['francophone', 'anglophone'].includes(String(studentData.section))) {
    throw businessError('invalid-argument', 'INVALID_ARGUMENT', 'Section élève invalide.');
  }
  if (!['nouveau', 'ancien'].includes(String(studentData.studentStatus))) {
    throw businessError('invalid-argument', 'INVALID_ARGUMENT', 'Statut élève invalide.');
  }
  if (privateData.transportZonePk !== undefined
      && (!Number.isSafeInteger(privateData.transportZonePk)
        || Number(privateData.transportZonePk) < 14
        || Number(privateData.transportZonePk) > 42)) {
    throw businessError('invalid-argument', 'INVALID_ARGUMENT', 'PK transport invalide.');
  }
  for (const key of FINANCE_KEYS) {
    const value = financeData[key];
    if (value !== undefined && key !== 'financialBypass'
        && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      throw businessError('invalid-argument', 'INVALID_ARGUMENT', `Champ financier ${key} invalide.`);
    }
  }
  if (financeData.financialBypass !== undefined) {
    const bypass = requireMap(financeData.financialBypass, 'financialBypass');
    if (typeof bypass.t1 !== 'boolean' || typeof bypass.t2 !== 'boolean' || typeof bypass.t3 !== 'boolean') {
      throw businessError('invalid-argument', 'INVALID_ARGUMENT', 'financialBypass invalide.');
    }
  }
};

export const executeCreateStudentSecure = async (
  uid: string,
  rawInput: unknown,
  firestore: FirebaseFirestore.Firestore = admin.firestore(),
  nowFactory: () => FirebaseFirestore.FieldValue | string = () => FieldValue.serverTimestamp()
): Promise<CreateStudentSecureResult> => {
  const input = requireMap(rawInput, 'payload') as unknown as CreateStudentSecureInput;
  const studentId = requireSafeId(input.studentId, 'studentId');
  const studentData = requireMap(input.studentData, 'studentData');
  const privateData = requireMap(input.privateData, 'privateData');
  const financeData = requireMap(input.financeData, 'financeData');
  requireMap(input.parentPrivateData, 'parentPrivateData');
  requireMap(input.parentFinanceData, 'parentFinanceData');
  validateStudentPayload(studentData, privateData, financeData);
  const fingerprint = buildSecureStudentFingerprint(studentData, privateData);
  const requestedMatricule = typeof input.requestedMatricule === 'string' && input.requestedMatricule.trim()
    ? normalizeSecureStudentMatricule(input.requestedMatricule)
    : null;

  for (let attempt = 0; attempt < (requestedMatricule ? 1 : MAX_AUTOMATIC_ATTEMPTS); attempt += 1) {
    const matricule = requestedMatricule ?? generateAutomaticMatricule(studentId, attempt);
    try {
      return await firestore.runTransaction(async transaction => {
        const userRef = firestore.collection('users').doc(uid);
        const studentRef = firestore.collection('students').doc(studentId);
        const userSnapshot = await transaction.get(userRef);
        if (!userSnapshot.exists) {
          throw businessError('permission-denied', 'PERMISSION_DENIED', 'Profil utilisateur introuvable.');
        }
        const user = userSnapshot.data() as InputMap;
        if ((user.active !== true && user.isActive !== true) || user.status === 'inactive') {
          throw businessError('permission-denied', 'PERMISSION_DENIED', 'Compte utilisateur inactif.');
        }
        if (!ALLOWED_ROLES.has(String(user.role))) {
          throw businessError('permission-denied', 'PERMISSION_DENIED', 'Rôle non autorisé.');
        }
        const schoolId = user.role === 'superAdmin'
          ? requireSafeId(studentData.schoolId, 'schoolId')
          : requireSafeId(user.schoolId, 'schoolId');
        const schoolRef = firestore.collection('schools').doc(schoolId);
        const schoolSnapshot = await transaction.get(schoolRef);
        if (!schoolSnapshot.exists) {
          throw businessError('failed-precondition', 'SCHOOL_NOT_FOUND', 'École introuvable.');
        }
        const school = schoolSnapshot.data() as InputMap;
        const academicYearId = typeof school.activeAcademicYearId === 'string' ? school.activeAcademicYearId : '';
        if (!academicYearId || academicYearId.includes('/')) {
          throw businessError('failed-precondition', 'INVALID_ACADEMIC_YEAR', 'Année académique active invalide.');
        }
        const classId = requireSafeId(studentData.classId, 'classId');
        const yearRef = firestore.collection('academicYears').doc(academicYearId);
        const classRef = firestore.collection('classes').doc(classId);
        const matriculeReservationId = `${schoolId}__${matricule}`;
        const duplicateReservationId = `${schoolId}__${fingerprint}`;
        const matriculeRef = firestore.collection('studentMatriculeReservations').doc(matriculeReservationId);
        const duplicateRef = firestore.collection('studentDuplicateReservations').doc(duplicateReservationId);
        const [yearSnapshot, classSnapshot, studentSnapshot, matriculeSnapshot, duplicateSnapshot] = await Promise.all([
          transaction.get(yearRef), transaction.get(classRef), transaction.get(studentRef),
          transaction.get(matriculeRef), transaction.get(duplicateRef)
        ]);

        if (!yearSnapshot.exists || yearSnapshot.data()?.schoolId !== schoolId || yearSnapshot.data()?.status !== 'active') {
          throw businessError('failed-precondition', 'INVALID_ACADEMIC_YEAR', 'Année académique active invalide.');
        }
        const yearName = requireString(yearSnapshot.data()?.name, 'academicYear.name', 30);
        if (!classSnapshot.exists || classSnapshot.data()?.schoolId !== schoolId || classSnapshot.data()?.isActive === false) {
          throw businessError('failed-precondition', 'INVALID_CLASS', 'Classe invalide.');
        }
        if (typeof classSnapshot.data()?.section === 'string'
            && classSnapshot.data()?.section !== studentData.section) {
          throw businessError('failed-precondition', 'INVALID_CLASS', 'Section de classe incohérente.');
        }
        if (studentSnapshot.exists) {
          const existing = studentSnapshot.data() as InputMap;
          if (existing.schoolId === schoolId && existing.matriculeReservationId === matriculeReservationId) {
            return {
              studentId, matricule: String(existing.matricule), matriculeNormalized: String(existing.matriculeNormalized),
              matriculeReservationId, duplicateFingerprint: String(existing.duplicateFingerprint),
              duplicateReservationId: String(existing.duplicateReservationId), academicYearId: String(existing.academicYearId),
              registrationYear: String(existing.registrationYear), created: false
            };
          }
          throw businessError('already-exists', 'STUDENT_ID_CONFLICT', 'Identifiant de création déjà utilisé.');
        }
        if (matriculeSnapshot.exists) {
          throw businessError('already-exists', 'MATRICULE_ALREADY_EXISTS', 'Matricule déjà utilisé.');
        }
        if (duplicateSnapshot.exists && input.confirmProbableDuplicate !== true) {
          throw businessError('already-exists', 'PROBABLE_DUPLICATE', 'Doublon probable détecté.');
        }
        const count = canonicalCount(school);
        if (count === null) {
          throw businessError('failed-precondition', 'STUDENT_COUNTER_NOT_INITIALIZED', 'Compteur élèves non initialisé.');
        }
        if (count >= configuredLimit(school)) {
          throw businessError('resource-exhausted', 'STUDENT_QUOTA_REACHED', 'Quota élèves atteint.');
        }

        const now = nowFactory();
        const audit = { createdAt: now, createdBy: uid, updatedAt: now, updatedBy: uid };
        const base = { id: studentId, schoolId, studentId };
        const publicRecord = {
          ...pick(studentData, STUDENT_KEYS), id: studentId, schoolId, academicYearId,
          registrationYear: yearName, schoolingStatus: 'active', matricule,
          matriculeNormalized: matricule, matriculeReservationId, duplicateFingerprint: fingerprint,
          duplicateReservationId, ...audit
        };
        transaction.update(schoolRef, {
          studentsCount: count + 1, lastStudentCounterMutationId: studentId,
          lastStudentCounterMutationType: 'create', updatedAt: now, updatedBy: uid
        });
        transaction.create(studentRef, publicRecord);
        transaction.create(firestore.collection('studentPrivate').doc(studentId), { ...base, ...pick(privateData, PRIVATE_KEYS), ...audit });
        transaction.create(firestore.collection('studentFinance').doc(studentId), {
          ...base, ...pick(financeData, FINANCE_KEYS), registrationFeePaid: 0,
          registrationFeeStatus: 'unpaid', feeT1: financeData.feeT1 ?? 0,
          feeT2: financeData.feeT2 ?? 0, feeT3: financeData.feeT3 ?? 0,
          financialBypass: financeData.financialBypass ?? { t1: false, t2: false, t3: false }, ...audit
        });
        transaction.create(firestore.collection('studentParentPrivate').doc(studentId), {
          ...base, dob: privateData.dob, ...audit
        });
        transaction.create(firestore.collection('studentParentFinance').doc(studentId), {
          ...base, feeT1: financeData.feeT1 ?? 0,
          feeT2: financeData.feeT2 ?? 0,
          feeT3: financeData.feeT3 ?? 0,
          financialBypass: financeData.financialBypass ?? { t1: false, t2: false, t3: false },
          ...audit
        });
        transaction.create(matriculeRef, {
          id: matriculeReservationId, schoolId, studentId, matriculeNormalized: matricule,
          createdAt: now, createdBy: uid
        });
        if (duplicateSnapshot.exists) {
          const existingIds = Array.isArray(duplicateSnapshot.data()?.studentIds) ? duplicateSnapshot.data()?.studentIds : [];
          transaction.update(duplicateRef, {
            studentIds: [...new Set([...existingIds, studentId])], lastStudentId: studentId,
            updatedAt: now, updatedBy: uid
          });
        } else {
          transaction.create(duplicateRef, {
            id: duplicateReservationId, schoolId, duplicateFingerprint: fingerprint,
            studentIds: [studentId], lastStudentId: studentId, ...audit
          });
        }
        return {
          studentId, matricule, matriculeNormalized: matricule, matriculeReservationId,
          duplicateFingerprint: fingerprint, duplicateReservationId, academicYearId,
          registrationYear: yearName, created: true
        };
      });
    } catch (error) {
      if (!requestedMatricule && error instanceof functions.https.HttpsError
          && error.details && (error.details as InputMap).businessCode === 'MATRICULE_ALREADY_EXISTS') {
        continue;
      }
      throw error;
    }
  }
  throw businessError('already-exists', 'AUTOMATIC_MATRICULE_EXHAUSTED', 'Aucun matricule automatique disponible.');
};

export const handleCreateStudentSecure = async (
  data: unknown,
  context: { auth?: { uid?: string } },
  firestore?: FirebaseFirestore.Firestore,
  nowFactory?: () => FirebaseFirestore.FieldValue | string
): Promise<CreateStudentSecureResult> => {
  if (!context.auth?.uid) {
    throw businessError('unauthenticated', 'UNAUTHENTICATED', 'Authentification requise.');
  }
  try {
    return await executeCreateStudentSecure(context.auth.uid, data, firestore, nowFactory);
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('[createStudentSecure] Internal failure.', {
      code: error instanceof Error ? error.name : 'unknown'
    });
    throw businessError('internal', 'INTERNAL', 'Création élève impossible.');
  }
};

export const createStudentSecure = functions.https.onCall((data, context) =>
  handleCreateStudentSecure(data, context)
);
