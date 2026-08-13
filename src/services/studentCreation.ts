import {
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type Firestore
} from 'firebase/firestore';
import { getCanonicalStudentCount, getConfiguredStudentLimit } from './studentQuota';

const MAX_MATRICULE_LENGTH = 64;
const MAX_AUTOMATIC_ATTEMPTS = 8;

export interface StudentSubmissionLock {
  current: boolean;
}

export const acquireStudentSubmissionLock = (lock: StudentSubmissionLock): boolean => {
  if (lock.current) return false;
  lock.current = true;
  return true;
};

export const releaseStudentSubmissionLock = (lock: StudentSubmissionLock): void => {
  lock.current = false;
};

export type StudentCreationErrorCode =
  | 'MATRICULE_ALREADY_EXISTS'
  | 'PROBABLE_DUPLICATE'
  | 'AUTOMATIC_MATRICULE_EXHAUSTED'
  | 'STUDENT_ID_CONFLICT'
  | 'SCHOOL_NOT_FOUND'
  | 'STUDENT_COUNTER_NOT_INITIALIZED'
  | 'STUDENT_QUOTA_REACHED';

export class StudentCreationError extends Error {
  readonly code: StudentCreationErrorCode;

  constructor(code: StudentCreationErrorCode) {
    super(code);
    this.name = 'StudentCreationError';
    this.code = code;
  }
}

const normalizeIdentityPart = (value: string): string => {
  return value
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const normalizeStudentMatricule = (value: string): string => {
  const normalized = normalizeIdentityPart(value);
  if (!normalized || normalized.length > MAX_MATRICULE_LENGTH) {
    throw new StudentCreationError('MATRICULE_ALREADY_EXISTS');
  }
  return normalized;
};

export const buildStudentDuplicateFingerprint = (student: {
  studentLastName: string;
  studentFirstName: string;
  dob: string;
  gender: string;
}): string => {
  const lastName = normalizeIdentityPart(student.studentLastName);
  const firstName = normalizeIdentityPart(student.studentFirstName);
  const dob = student.dob.trim();
  const gender = student.gender.trim().toUpperCase();
  return `${lastName}__${firstName}__${dob}__${gender}`;
};

export const buildStudentMatriculeReservationId = (
  schoolId: string,
  normalizedMatricule: string
): string => `${schoolId}__${normalizedMatricule}`;

export const buildStudentDuplicateReservationId = (
  schoolId: string,
  duplicateFingerprint: string
): string => `${schoolId}__${duplicateFingerprint}`;

export const generateAutomaticStudentMatricule = (
  studentId: string,
  attempt = 0
): string => {
  let hash = 2166136261;
  for (const character of `${studentId}:${attempt}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `MAT-2026-${1000 + ((hash >>> 0) % 9000)}`;
};

export interface CreateStudentAtomicallyOptions {
  firestore: Firestore;
  studentId: string;
  schoolId: string;
  actorId: string;
  requestedMatricule?: string;
  studentData: DocumentData;
  privateData: DocumentData;
  financeData: DocumentData;
  parentPrivateData: DocumentData;
  parentFinanceData: DocumentData;
  confirmProbableDuplicate?: boolean;
  generateMatricule?: (attempt: number) => string;
  maxAutomaticAttempts?: number;
  isMatriculeKnown?: (normalizedMatricule: string) => boolean;
}

export interface CreateStudentAtomicallyResult {
  studentId: string;
  matricule: string;
  matriculeNormalized: string;
  matriculeReservationId: string;
  duplicateFingerprint: string;
  duplicateReservationId: string;
  created: boolean;
}

export const createStudentAtomically = async ({
  firestore,
  studentId,
  schoolId,
  actorId,
  requestedMatricule,
  studentData,
  privateData,
  financeData,
  parentPrivateData,
  parentFinanceData,
  confirmProbableDuplicate = false,
  generateMatricule = attempt => generateAutomaticStudentMatricule(studentId, attempt),
  maxAutomaticAttempts = MAX_AUTOMATIC_ATTEMPTS,
  isMatriculeKnown = () => false
}: CreateStudentAtomicallyOptions): Promise<CreateStudentAtomicallyResult> => {
  const isAutomatic = !requestedMatricule?.trim();
  const duplicateFingerprint = buildStudentDuplicateFingerprint({
    studentLastName: String(studentData.studentLastName ?? ''),
    studentFirstName: String(studentData.studentFirstName ?? ''),
    dob: String(privateData.dob ?? studentData.dob ?? ''),
    gender: String(studentData.gender ?? '')
  });
  const duplicateReservationId = buildStudentDuplicateReservationId(schoolId, duplicateFingerprint);

  for (let attempt = 0; attempt < (isAutomatic ? maxAutomaticAttempts : 1); attempt += 1) {
    const matriculeNormalized = normalizeStudentMatricule(
      isAutomatic ? generateMatricule(attempt) : requestedMatricule ?? ''
    );
    const matriculeReservationId = buildStudentMatriculeReservationId(
      schoolId,
      matriculeNormalized
    );

    if (isMatriculeKnown(matriculeNormalized)) {
      if (isAutomatic) continue;
      throw new StudentCreationError('MATRICULE_ALREADY_EXISTS');
    }

    try {
      return await runTransaction(firestore, async transaction => {
        const studentRef = doc(firestore, 'students', studentId);
        const schoolRef = doc(firestore, 'schools', schoolId);
        const matriculeReservationRef = doc(
          firestore,
          'studentMatriculeReservations',
          matriculeReservationId
        );
        const duplicateReservationRef = doc(
          firestore,
          'studentDuplicateReservations',
          duplicateReservationId
        );
        const privateRef = doc(firestore, 'studentPrivate', studentId);
        const financeRef = doc(firestore, 'studentFinance', studentId);
        const parentPrivateRef = doc(firestore, 'studentParentPrivate', studentId);
        const parentFinanceRef = doc(firestore, 'studentParentFinance', studentId);

        const [schoolSnapshot, matriculeReservation, duplicateReservation] = await Promise.all([
          transaction.get(schoolRef),
          transaction.get(matriculeReservationRef),
          transaction.get(duplicateReservationRef)
        ]);

        if (!schoolSnapshot.exists()) throw new StudentCreationError('SCHOOL_NOT_FOUND');

        if (matriculeReservation.exists()) {
          if (matriculeReservation.data().studentId === studentId) {
            const existingStudent = await transaction.get(studentRef);
            if (!existingStudent.exists() || existingStudent.data().schoolId !== schoolId) {
              throw new StudentCreationError('STUDENT_ID_CONFLICT');
            }
            const existingData = existingStudent.data();
            return {
              studentId,
              matricule: String(existingData.matricule),
              matriculeNormalized: String(existingData.matriculeNormalized),
              matriculeReservationId: String(existingData.matriculeReservationId),
              duplicateFingerprint: String(existingData.duplicateFingerprint),
              duplicateReservationId: String(existingData.duplicateReservationId),
              created: false
            };
          }
          throw new StudentCreationError('MATRICULE_ALREADY_EXISTS');
        }
        if (duplicateReservation.exists() && !confirmProbableDuplicate) {
          throw new StudentCreationError('PROBABLE_DUPLICATE');
        }

        const school = schoolSnapshot.data();
        const currentStudentsCount = getCanonicalStudentCount(school);
        if (currentStudentsCount === null) {
          throw new StudentCreationError('STUDENT_COUNTER_NOT_INITIALIZED');
        }
        if (currentStudentsCount >= getConfiguredStudentLimit(school)) {
          throw new StudentCreationError('STUDENT_QUOTA_REACHED');
        }

        const timestamp = serverTimestamp();
        transaction.update(schoolRef, {
          studentsCount: currentStudentsCount + 1,
          lastStudentCounterMutationId: studentId,
          lastStudentCounterMutationType: 'create',
          updatedAt: timestamp,
          updatedBy: actorId
        });
        transaction.set(studentRef, {
          ...studentData,
          id: studentId,
          schoolId,
          matricule: matriculeNormalized,
          matriculeNormalized,
          matriculeReservationId,
          duplicateFingerprint,
          duplicateReservationId,
          createdAt: timestamp,
          createdBy: actorId,
          updatedAt: timestamp,
          updatedBy: actorId
        });
        transaction.set(privateRef, {
          ...privateData,
          id: studentId,
          schoolId,
          studentId,
          createdAt: timestamp,
          createdBy: actorId,
          updatedAt: timestamp,
          updatedBy: actorId
        });
        transaction.set(financeRef, {
          ...financeData,
          id: studentId,
          schoolId,
          studentId,
          createdAt: timestamp,
          createdBy: actorId,
          updatedAt: timestamp,
          updatedBy: actorId
        });
        transaction.set(parentPrivateRef, {
          ...parentPrivateData,
          id: studentId,
          schoolId,
          studentId,
          createdAt: timestamp,
          createdBy: actorId,
          updatedAt: timestamp,
          updatedBy: actorId
        });
        transaction.set(parentFinanceRef, {
          ...parentFinanceData,
          id: studentId,
          schoolId,
          studentId,
          createdAt: timestamp,
          createdBy: actorId,
          updatedAt: timestamp,
          updatedBy: actorId
        });
        transaction.set(matriculeReservationRef, {
          id: matriculeReservationId,
          schoolId,
          studentId,
          matriculeNormalized,
          createdAt: timestamp,
          createdBy: actorId
        });

        if (duplicateReservation.exists()) {
          const existingStudentIds = duplicateReservation.data().studentIds;
          const studentIds = Array.isArray(existingStudentIds)
            ? [...new Set([...existingStudentIds, studentId])]
            : [studentId];
          transaction.update(duplicateReservationRef, {
            studentIds,
            lastStudentId: studentId,
            updatedAt: timestamp,
            updatedBy: actorId
          });
        } else {
          transaction.set(duplicateReservationRef, {
            id: duplicateReservationId,
            schoolId,
            duplicateFingerprint,
            studentIds: [studentId],
            lastStudentId: studentId,
            createdAt: timestamp,
            createdBy: actorId,
            updatedAt: timestamp,
            updatedBy: actorId
          });
        }

        return {
          studentId,
          matricule: matriculeNormalized,
          matriculeNormalized,
          matriculeReservationId,
          duplicateFingerprint,
          duplicateReservationId,
          created: true
        };
      });
    } catch (error) {
      if (
        isAutomatic &&
        error instanceof StudentCreationError &&
        error.code === 'MATRICULE_ALREADY_EXISTS'
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new StudentCreationError('AUTOMATIC_MATRICULE_EXHAUSTED');
};
