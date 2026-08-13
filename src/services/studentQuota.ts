import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';

export type StudentQuotaSchool = {
  isInternalSchool?: boolean;
  subscriptionPlan?: string;
  studentLimit?: number | null;
  studentsCount?: number;
  studentCount?: number;
};

export type StudentQuotaErrorCode =
  | 'STUDENT_COUNTER_NOT_INITIALIZED'
  | 'STUDENT_QUOTA_REACHED'
  | 'STUDENT_COUNTER_INCONSISTENT'
  | 'STUDENT_NOT_FOUND'
  | 'SCHOOL_NOT_FOUND'
  | 'CROSS_SCHOOL_STUDENT';

export class StudentQuotaError extends Error {
  readonly code: StudentQuotaErrorCode;

  constructor(code: StudentQuotaErrorCode) {
    super(code);
    this.name = 'StudentQuotaError';
    this.code = code;
  }
}

export const getConfiguredStudentLimit = (school: StudentQuotaSchool): number => {
  if (school.isInternalSchool === true || school.subscriptionPlan === 'premium') return Infinity;
  if (typeof school.studentLimit === 'number' && school.studentLimit >= 0) return school.studentLimit;
  return school.subscriptionPlan === 'pilot' || school.subscriptionPlan === 'standard' ? 1000 : 200;
};

export const getCanonicalStudentCount = (school: StudentQuotaSchool): number | null =>
  typeof school.studentsCount === 'number' && Number.isSafeInteger(school.studentsCount) && school.studentsCount >= 0
    ? school.studentsCount
    : null;

export const getStudentCountForDisplay = (school: StudentQuotaSchool): number =>
  getCanonicalStudentCount(school)
  ?? (typeof school.studentCount === 'number' ? school.studentCount : 0);

export const updateStudentSchoolingStatusAtomically = async ({
  firestore,
  schoolId,
  studentId,
  actorId,
  targetStatus,
  studentPatch = {}
}: {
  firestore: Firestore;
  schoolId: string;
  studentId: string;
  actorId: string;
  targetStatus: 'active' | 'inactive';
  studentPatch?: Record<string, unknown>;
}): Promise<'updated' | 'unchanged'> => runTransaction(firestore, async transaction => {
  const schoolRef = doc(firestore, 'schools', schoolId);
  const studentRef = doc(firestore, 'students', studentId);
  const [schoolSnapshot, studentSnapshot] = await Promise.all([
    transaction.get(schoolRef),
    transaction.get(studentRef)
  ]);

  if (!schoolSnapshot.exists()) throw new StudentQuotaError('SCHOOL_NOT_FOUND');
  if (!studentSnapshot.exists()) throw new StudentQuotaError('STUDENT_NOT_FOUND');
  const student = studentSnapshot.data();
  if (student.schoolId !== schoolId) throw new StudentQuotaError('CROSS_SCHOOL_STUDENT');

  const currentStatus = student.schoolingStatus === 'inactive' ? 'inactive' : 'active';
  if (currentStatus === targetStatus) return 'unchanged';

  const school = schoolSnapshot.data();
  const currentCount = getCanonicalStudentCount(school);
  if (currentCount === null) throw new StudentQuotaError('STUDENT_COUNTER_NOT_INITIALIZED');

  const activating = targetStatus === 'active';
  if (activating && currentCount >= getConfiguredStudentLimit(school)) {
    throw new StudentQuotaError('STUDENT_QUOTA_REACHED');
  }
  if (!activating && currentCount === 0) {
    throw new StudentQuotaError('STUDENT_COUNTER_INCONSISTENT');
  }

  const timestamp = serverTimestamp();
  transaction.update(schoolRef, {
    studentsCount: activating ? currentCount + 1 : currentCount - 1,
    lastStudentCounterMutationId: studentId,
    lastStudentCounterMutationType: activating ? 'reactivate' : 'deactivate',
    updatedAt: timestamp,
    updatedBy: actorId
  });
  transaction.update(studentRef, {
    ...studentPatch,
    schoolingStatus: targetStatus,
    updatedAt: timestamp,
    updatedBy: actorId
  });
  return 'updated';
});
