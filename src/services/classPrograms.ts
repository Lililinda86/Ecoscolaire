import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../db/firebase';
import type { ClassProgram, ClassSubject } from '../types';
import {
  buildClassProgramId,
  ClassProgramServiceError
} from './classProgramQueryResult';

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
        'Vous n’êtes pas autorisé à consulter le programme de cette classe.'
      );
    }
    const errMessage = (error instanceof Error) ? error.message : String(error);
    throw new ClassProgramServiceError('FIRESTORE_ERROR', errMessage || 'Firestore reading error');
  }
}

import {
  interpretClassProgramQueryResult,
  validateClassProgramIdentityParams
} from './classProgramQueryResult';
import { buildClassProgramQuery } from './classProgramQueryFactory';

export async function getClassProgramByIdentity(params: {
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
}): Promise<ClassProgram | null> {
  const validated = validateClassProgramIdentityParams(params);
  if (!validated) {
    return null;
  }

  const { cleanSchoolId, cleanAcademicYearId, cleanClassId } = validated;

  try {
    const q = buildClassProgramQuery(db, cleanSchoolId, cleanAcademicYearId, cleanClassId);
    const snap = await getDocs(q);

    return interpretClassProgramQueryResult({
      docs: snap.docs,
      schoolId: cleanSchoolId,
      academicYearId: cleanAcademicYearId,
      classId: cleanClassId
    });
  } catch (error: unknown) {
    if (error instanceof ClassProgramServiceError) {
      throw error;
    }
    const errObj = error as Record<string, unknown>;
    if (errObj && errObj.code === 'permission-denied') {
      throw new ClassProgramServiceError(
        'PROGRAM_PERMISSION_DENIED',
        'Vous n’êtes pas autorisé à consulter le programme de cette classe.'
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
        'Vous n’êtes pas autorisé à consulter le programme de cette classe.'
      );
    }
    const errMessage = (error instanceof Error) ? error.message : String(error);
    throw new ClassProgramServiceError('FIRESTORE_ERROR', errMessage || 'Firestore reading error');
  }
}
