import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

export interface BulkAddSubjectsPayload {
  schoolId: string;
  academicYearId: string;
  classIds: string[];
  subjectIds: string[];
}

export interface ClassBulkResult {
  classId: string;
  status: 'success' | 'error';
  added: number;
  ignored: number;
  error: string | null;
}

export interface BulkAddSubjectsResult {
  classesProcessed: number;
  totalSubjectsAdded: number;
  totalDuplicatesIgnored: number;
  details: ClassBulkResult[];
}

export async function bulkAddSubjectsToClasses(
  payload: BulkAddSubjectsPayload
): Promise<BulkAddSubjectsResult> {
  const functions = getFunctions(getApp());
  const callable = httpsCallable<BulkAddSubjectsPayload, BulkAddSubjectsResult>(
    functions,
    'bulkAddSubjectsToClasses'
  );

  try {
    const response = await callable(payload);
    return response.data;
  } catch (err: unknown) {
    console.error('Error in bulkAddSubjectsToClasses:', err);
    throw err;
  }
}
