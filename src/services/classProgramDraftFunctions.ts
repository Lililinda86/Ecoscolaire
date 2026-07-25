import { httpsCallable } from 'firebase/functions';
import { functions } from '../db/firebase';

export interface EnsureClassProgramDraftInput {
  schoolId: string;
  academicYearId: string;
  classId: string;
}

export interface EnsureClassProgramDraftResult {
  programId: string;
  draftRevisionId: string;
  draftRevisionNumber: number;
  created: boolean;
  clonedSubjectCount: number;
}

export type EnsureDraftErrorType =
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'INVALID_ARGUMENT'
  | 'CLASS_NOT_FOUND'
  | 'PROGRAM_NOT_FOUND'
  | 'PROGRAM_NOT_PUBLISHED'
  | 'PROGRAM_INTEGRITY_ERROR'
  | 'REVISION_CONFLICT'
  | 'PROGRAM_TOO_LARGE'
  | 'INTERNAL_ERROR';

export class EnsureDraftError extends Error {
  public code: EnsureDraftErrorType;

  constructor(code: EnsureDraftErrorType, message: string) {
    super(message);
    this.code = code;
    this.name = 'EnsureDraftError';
  }
}

export async function ensureClassProgramDraft({
  schoolId,
  academicYearId,
  classId
}: EnsureClassProgramDraftInput): Promise<EnsureClassProgramDraftResult> {
  try {
    const callable = httpsCallable<EnsureClassProgramDraftInput, EnsureClassProgramDraftResult>(
      functions,
      'ensureClassProgramDraft'
    );

    const response = await callable({
      schoolId,
      academicYearId,
      classId
    });

    return response.data;
  } catch (error: unknown) {
    const err = error as { details?: { businessCode?: string }; message?: string; code?: string };
    // Map Firestore/Firebase functions HttpsError details if present
    const details = err.details;
    const businessCode = details?.businessCode as EnsureDraftErrorType | undefined;

    if (businessCode) {
      throw new EnsureDraftError(businessCode, err.message || 'Erreur lors de la création du brouillon.');
    }

    // Fallback parsing based on error codes
    const code = err.code;
    let mappedCode: EnsureDraftErrorType = 'INTERNAL_ERROR';

    if (code === 'unauthenticated') {
      mappedCode = 'UNAUTHENTICATED';
    } else if (code === 'permission-denied') {
      mappedCode = 'PERMISSION_DENIED';
    } else if (code === 'invalid-argument') {
      mappedCode = 'INVALID_ARGUMENT';
    } else if (code === 'not-found') {
      mappedCode = 'PROGRAM_NOT_FOUND';
    } else if (code === 'failed-precondition') {
      mappedCode = 'PROGRAM_INTEGRITY_ERROR';
    } else if (code === 'aborted') {
      mappedCode = 'REVISION_CONFLICT';
    } else if (code === 'resource-exhausted') {
      mappedCode = 'PROGRAM_TOO_LARGE';
    }

    throw new EnsureDraftError(mappedCode, err.message || 'Une erreur serveur est survenue.');
  }
}
