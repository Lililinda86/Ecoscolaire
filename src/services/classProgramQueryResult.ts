export type ClassProgramErrorType =
  | 'PROGRAM_NOT_FOUND'
  | 'PROGRAM_NOT_PUBLISHED'
  | 'PROGRAM_PERMISSION_DENIED'
  | 'PROGRAM_INTEGRITY_ERROR'
  | 'REVISION_NOT_FOUND'
  | 'FIRESTORE_ERROR';

export class ClassProgramServiceError extends Error {
  public code: ClassProgramErrorType;

  constructor(code: ClassProgramErrorType, message: string) {
    super(message);
    this.code = code;
    this.name = 'ClassProgramServiceError';
  }
}

export function buildClassProgramId(
  schoolId: string,
  academicYearId: string,
  classId: string
): string {
  return `${schoolId}__${academicYearId}__${classId}`;
}

export interface DocumentSnapshotSnapshot {
  id: string;
  data: () => Record<string, unknown>;
}

export function interpretClassProgramQueryResult({
  docs,
  schoolId,
  academicYearId,
  classId
}: {
  docs: DocumentSnapshotSnapshot[];
  schoolId: string;
  academicYearId: string;
  classId: string;
}): ClassProgram | null {
  if (docs.length === 0) {
    return null;
  }

  if (docs.length > 1) {
    throw new ClassProgramServiceError(
      'PROGRAM_INTEGRITY_ERROR',
      'Les données du programme de cette classe sont incohérentes.'
    );
  }

  const docSnap = docs[0];
  const data = docSnap.data() as Record<string, unknown>;
  const expectedId = buildClassProgramId(schoolId, academicYearId, classId);

  if (
    docSnap.id !== expectedId ||
    (data.id !== undefined && data.id !== expectedId) ||
    data.schoolId !== schoolId ||
    data.academicYearId !== academicYearId ||
    data.classId !== classId
  ) {
    throw new ClassProgramServiceError(
      'PROGRAM_INTEGRITY_ERROR',
      'Les données du programme de cette classe sont incohérentes.'
    );
  }

  return data as unknown as ClassProgram;
}

export function validateClassProgramIdentityParams({
  schoolId,
  academicYearId,
  classId
}: {
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
}): { cleanSchoolId: string; cleanAcademicYearId: string; cleanClassId: string } | null {
  if (
    !schoolId || schoolId.trim() === '' || schoolId.includes('/') ||
    !academicYearId || academicYearId.trim() === '' || academicYearId.includes('/') ||
    !classId || classId.trim() === '' || classId.includes('/')
  ) {
    return null;
  }
  return {
    cleanSchoolId: schoolId.trim(),
    cleanAcademicYearId: academicYearId.trim(),
    cleanClassId: classId.trim()
  };
}
