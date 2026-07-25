import { getFunctions, httpsCallable } from 'firebase/functions';

export type StaffUserLinkErrorType =
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'INVALID_ARGUMENT'
  | 'USER_NOT_FOUND'
  | 'USER_INACTIVE'
  | 'USER_NOT_TEACHER'
  | 'STAFF_NOT_FOUND'
  | 'STAFF_INACTIVE'
  | 'STAFF_NOT_TEACHER'
  | 'USER_ALREADY_LINKED'
  | 'STAFF_ALREADY_LINKED'
  | 'STAFF_USER_LINK_NOT_FOUND'
  | 'STAFF_USER_LINK_INACTIVE'
  | 'LINK_INTEGRITY_ERROR'
  | 'SCHOOL_MISMATCH'
  | 'INTERNAL_ERROR';

export class StaffUserLinkError extends Error {
  businessCode: StaffUserLinkErrorType;
  constructor(businessCode: StaffUserLinkErrorType, message: string) {
    super(message);
    this.businessCode = businessCode;
    this.name = 'StaffUserLinkError';
  }
}

export interface LinkStaffToUserInput {
  schoolId: string;
  staffId: string;
  userId: string;
}

export interface LinkStaffToUserOutput {
  linkId: string;
  schoolId: string;
  userId: string;
  staffId: string;
  linked: boolean;
  alreadyLinked: boolean;
}

export interface UnlinkStaffFromUserInput {
  schoolId: string;
  staffId: string;
  userId: string;
  reason?: string;
}

export interface UnlinkStaffFromUserOutput {
  linkId?: string;
  schoolId: string;
  userId: string;
  staffId: string;
  unlinked: boolean;
  alreadyUnlinked: boolean;
}

export async function linkStaffToUser(
  input: LinkStaffToUserInput
): Promise<LinkStaffToUserOutput> {
  const functionsInstance = getFunctions();
  const callable = httpsCallable<LinkStaffToUserInput, LinkStaffToUserOutput>(
    functionsInstance,
    'linkStaffToUser'
  );

  try {
    const response = await callable(input);
    return response.data;
  } catch (error: unknown) {
    throw parseStaffUserLinkError(error, 'Erreur lors de la liaison de l\'enseignant.');
  }
}

export async function unlinkStaffFromUser(
  input: UnlinkStaffFromUserInput
): Promise<UnlinkStaffFromUserOutput> {
  const functionsInstance = getFunctions();
  const callable = httpsCallable<UnlinkStaffFromUserInput, UnlinkStaffFromUserOutput>(
    functionsInstance,
    'unlinkStaffFromUser'
  );

  try {
    const response = await callable(input);
    return response.data;
  } catch (error: unknown) {
    throw parseStaffUserLinkError(error, 'Erreur lors de la dissociation de l\'enseignant.');
  }
}

function parseStaffUserLinkError(error: unknown, fallbackMessage: string): StaffUserLinkError {
  const err = error as { details?: { businessCode?: string }; message?: string; code?: string };
  const details = err.details;
  const businessCode = details?.businessCode as StaffUserLinkErrorType | undefined;

  if (businessCode) {
    return new StaffUserLinkError(businessCode, err.message || fallbackMessage);
  }

  // Fallback parsing based on standard Firebase functions error codes
  const code = err.code;
  let mappedCode: StaffUserLinkErrorType = 'INTERNAL_ERROR';

  if (code === 'unauthenticated') {
    mappedCode = 'UNAUTHENTICATED';
  } else if (code === 'permission-denied') {
    mappedCode = 'PERMISSION_DENIED';
  } else if (code === 'invalid-argument') {
    mappedCode = 'INVALID_ARGUMENT';
  } else if (code === 'not-found') {
    mappedCode = 'STAFF_USER_LINK_NOT_FOUND';
  } else if (code === 'already-exists') {
    mappedCode = 'USER_ALREADY_LINKED';
  } else if (code === 'failed-precondition') {
    mappedCode = 'LINK_INTEGRITY_ERROR';
  }

  return new StaffUserLinkError(mappedCode, err.message || 'Une erreur serveur est survenue.');
}
