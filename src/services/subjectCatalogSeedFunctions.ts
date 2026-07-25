import { getFunctions, httpsCallable } from 'firebase/functions';

export type SubjectSeedErrorType =
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'INVALID_ARGUMENT'
  | 'SCHOOL_MISMATCH'
  | 'SUBJECT_SEED_CONFLICT'
  | 'SEED_INTEGRITY_ERROR'
  | 'INTERNAL_ERROR';

export class SubjectSeedError extends Error {
  businessCode: SubjectSeedErrorType;
  constructor(businessCode: SubjectSeedErrorType, message: string) {
    super(message);
    this.businessCode = businessCode;
    this.name = 'SubjectSeedError';
  }
}

export interface SeedDefaultSubjectCatalogInput {
  schoolId: string;
}

export interface SeedDefaultSubjectCatalogOutput {
  seedVersion: string;
  totalCandidates: number;
  createdCount: number;
  skippedCount: number;
  existingByCodeCount: number;
  existingByAliasCount: number;
  createdSubjectIds: string[];
}

export async function seedDefaultSubjectCatalog(
  input: SeedDefaultSubjectCatalogInput
): Promise<SeedDefaultSubjectCatalogOutput> {
  const functionsInstance = getFunctions();
  const callable = httpsCallable<SeedDefaultSubjectCatalogInput, SeedDefaultSubjectCatalogOutput>(
    functionsInstance,
    'seedDefaultSubjectCatalog'
  );

  try {
    const response = await callable(input);
    return response.data;
  } catch (error: unknown) {
    throw parseSubjectSeedError(error, 'Erreur lors du préremplissage du catalogue.');
  }
}

function parseSubjectSeedError(error: unknown, fallbackMessage: string): SubjectSeedError {
  const err = error as { details?: { businessCode?: string }; message?: string; code?: string };
  const details = err.details;
  const businessCode = details?.businessCode as SubjectSeedErrorType | undefined;

  if (businessCode) {
    return new SubjectSeedError(businessCode, err.message || fallbackMessage);
  }

  const code = err.code;
  let mappedCode: SubjectSeedErrorType = 'INTERNAL_ERROR';

  if (code === 'unauthenticated') {
    mappedCode = 'UNAUTHENTICATED';
  } else if (code === 'permission-denied') {
    mappedCode = 'PERMISSION_DENIED';
  } else if (code === 'invalid-argument') {
    mappedCode = 'INVALID_ARGUMENT';
  } else if (code === 'failed-precondition') {
    mappedCode = 'SEED_INTEGRITY_ERROR';
  }

  return new SubjectSeedError(mappedCode, err.message || 'Une erreur serveur est survenue.');
}
