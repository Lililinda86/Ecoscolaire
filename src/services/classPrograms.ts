import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../db/firebase';
import type { ClassProgram, ClassSubject } from '../types';

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

export async function getClassProgramById(
  schoolId: string,
  academicYearId: string,
  classId: string
): Promise<ClassProgram> {
  const programId = buildClassProgramId(schoolId, academicYearId, classId);
  try {
    const docRef = doc(db, 'classPrograms', programId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      throw new ClassProgramServiceError('PROGRAM_NOT_FOUND', 'Program not found');
    }

    const data = snap.data() as ClassProgram;

    // Integrity checks
    if (
      data.id !== programId ||
      data.schoolId !== schoolId ||
      data.classId !== classId ||
      data.academicYearId !== academicYearId
    ) {
      throw new ClassProgramServiceError(
        'PROGRAM_INTEGRITY_ERROR',
        'Program data integrity mismatch'
      );
    }

    return data;
  } catch (error: unknown) {
    if (error instanceof ClassProgramServiceError) {
      throw error;
    }
    const errObj = error as Record<string, unknown>;
    if (errObj && errObj.code === 'permission-denied') {
      throw new ClassProgramServiceError(
        'PROGRAM_PERMISSION_DENIED',
        'Permission denied reading program'
      );
    }
    const errMessage = (error instanceof Error) ? error.message : String(error);
    throw new ClassProgramServiceError('FIRESTORE_ERROR', errMessage || 'Firestore reading error');
  }
}

export async function getClassSubjectsByRevision(
  schoolId: string,
  programId: string,
  revisionId: string
): Promise<ClassSubject[]> {
  try {
    const collRef = collection(db, 'classSubjects');
    const q = query(
      collRef,
      where('schoolId', '==', schoolId),
      where('programId', '==', programId),
      where('revisionId', '==', revisionId)
    );

    const snap = await getDocs(q);
    const list: ClassSubject[] = [];
    snap.forEach((d) => {
      list.push(d.data() as ClassSubject);
    });

    // Local sorting:
    // 1. displayOrder ascending
    // 2. subjectNameSnapshot using localeCompare
    list.sort((a, b) => {
      const orderA = a.displayOrder ?? 0;
      const orderB = b.displayOrder ?? 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.subjectNameSnapshot || '').localeCompare(b.subjectNameSnapshot || '');
    });

    return list;
  } catch (error: unknown) {
    const errObj = error as Record<string, unknown>;
    if (errObj && errObj.code === 'permission-denied') {
      throw new ClassProgramServiceError(
        'PROGRAM_PERMISSION_DENIED',
        'Permission denied reading subjects'
      );
    }
    const errMessage = (error instanceof Error) ? error.message : String(error);
    throw new ClassProgramServiceError('FIRESTORE_ERROR', errMessage || 'Firestore reading error');
  }
}
