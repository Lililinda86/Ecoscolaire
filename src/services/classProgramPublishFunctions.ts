import { getFunctions, httpsCallable } from 'firebase/functions';

export type PublishDraftErrorType =
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'INVALID_ARGUMENT'
  | 'CLASS_NOT_FOUND'
  | 'CLASS_INTEGRITY_ERROR'
  | 'PROGRAM_NOT_FOUND'
  | 'PROGRAM_NOT_READY'
  | 'PROGRAM_INTEGRITY_ERROR'
  | 'DRAFT_CHANGED'
  | 'NO_ACTIVE_SUBJECT'
  | 'DUPLICATE_SUBJECT'
  | 'INTERNAL_ERROR';

export class PublishDraftError extends Error {
  businessCode: PublishDraftErrorType;
  constructor(businessCode: PublishDraftErrorType, message: string) {
    super(message);
    this.businessCode = businessCode;
    this.name = 'PublishDraftError';
  }
}

export interface PublishClassProgramDraftInput {
  schoolId: string;
  academicYearId: string;
  classId: string;
  expectedDraftRevisionId: string;
  expectedDraftStateToken: string;
}

export interface PublishClassProgramDraftOutput {
  programId: string;
  publishedRevisionId: string;
  publishedRevisionNumber: number;
  published: boolean;
  alreadyPublished: boolean;
  activeSubjectCount: number;
  inactiveSubjectCount: number;
  publishedDraftStateToken: string;
}

export async function publishClassProgramDraft(
  input: PublishClassProgramDraftInput
): Promise<PublishClassProgramDraftOutput> {
  const { schoolId, academicYearId, classId, expectedDraftRevisionId, expectedDraftStateToken } = input;
  const functionsInstance = getFunctions();

  // Use 'publishClassProgramDraft' as registered in Functions export
  const callable = httpsCallable<PublishClassProgramDraftInput, PublishClassProgramDraftOutput>(
    functionsInstance,
    'publishClassProgramDraft'
  );

  try {
    const response = await callable({
      schoolId,
      academicYearId,
      classId,
      expectedDraftRevisionId,
      expectedDraftStateToken
    });

    return response.data;
  } catch (error: unknown) {
    const err = error as { details?: { businessCode?: string }; message?: string; code?: string };
    const details = err.details;
    const businessCode = details?.businessCode as PublishDraftErrorType | undefined;

    if (businessCode) {
      throw new PublishDraftError(businessCode, err.message || 'Erreur lors de la publication du programme.');
    }

    // Fallback parsing based on error codes
    const code = err.code;
    let mappedCode: PublishDraftErrorType = 'INTERNAL_ERROR';

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
      mappedCode = 'DRAFT_CHANGED';
    }

    throw new PublishDraftError(mappedCode, err.message || 'Une erreur serveur est survenue.');
  }
}
