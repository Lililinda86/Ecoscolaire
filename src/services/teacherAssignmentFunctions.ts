import { getFunctions, httpsCallable } from 'firebase/functions';

export type TeacherAssignmentErrorType =
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'INVALID_ARGUMENT'
  | 'SCHOOL_MISMATCH'
  | 'CLASS_NOT_FOUND'
  | 'CLASS_INACTIVE'
  | 'TEACHER_NOT_FOUND'
  | 'TEACHER_INACTIVE'
  | 'TEACHER_NOT_ELIGIBLE'
  | 'TEACHER_LINK_INTEGRITY_ERROR'
  | 'PROGRAM_NOT_FOUND'
  | 'PROGRAM_NOT_PUBLISHED'
  | 'PROGRAM_INTEGRITY_ERROR'
  | 'SUBJECT_NOT_IN_PUBLISHED_PROGRAM'
  | 'PUBLISHED_SUBJECT_INACTIVE'
  | 'ASSIGNMENT_NOT_FOUND'
  | 'ASSIGNMENT_ALREADY_EXISTS'
  | 'ASSIGNMENT_INTEGRITY_ERROR'
  | 'INTERNAL_ERROR';

export class TeacherAssignmentError extends Error {
  businessCode: TeacherAssignmentErrorType;
  constructor(businessCode: TeacherAssignmentErrorType, message: string) {
    super(message);
    this.businessCode = businessCode;
    this.name = 'TeacherAssignmentError';
  }
}

export interface SetPrimaryTeacherAssignmentInput {
  schoolId: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  teacherStaffId: string;
}

export interface SetPrimaryTeacherAssignmentOutput {
  assigned: boolean;
  alreadyAssigned: boolean;
  assignmentId: string;
  slotId: string;
}

export interface DeactivateTeacherAssignmentInput {
  schoolId: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  reason?: string;
}

export interface DeactivateTeacherAssignmentOutput {
  deactivated: boolean;
  alreadyDeactivated: boolean;
  assignmentId: string;
  slotId: string;
}

export async function setPrimaryTeacherAssignment(
  input: SetPrimaryTeacherAssignmentInput
): Promise<SetPrimaryTeacherAssignmentOutput> {
  const functionsInstance = getFunctions();
  const callable = httpsCallable<SetPrimaryTeacherAssignmentInput, SetPrimaryTeacherAssignmentOutput>(
    functionsInstance,
    'setPrimaryTeacherAssignment'
  );

  try {
    const response = await callable(input);
    return response.data;
  } catch (error: unknown) {
    throw parseTeacherAssignmentError(error, 'Erreur lors de l\'affectation de l\'enseignant.');
  }
}

export async function deactivateTeacherAssignment(
  input: DeactivateTeacherAssignmentInput
): Promise<DeactivateTeacherAssignmentOutput> {
  const functionsInstance = getFunctions();
  const callable = httpsCallable<DeactivateTeacherAssignmentInput, DeactivateTeacherAssignmentOutput>(
    functionsInstance,
    'deactivateTeacherAssignment'
  );

  try {
    const response = await callable(input);
    return response.data;
  } catch (error: unknown) {
    throw parseTeacherAssignmentError(error, 'Erreur lors de la désaffectation de l\'enseignant.');
  }
}

function parseTeacherAssignmentError(error: unknown, fallbackMessage: string): TeacherAssignmentError {
  const err = error as { details?: { businessCode?: string }; message?: string; code?: string };
  const details = err.details;
  const businessCode = details?.businessCode as TeacherAssignmentErrorType | undefined;

  if (businessCode) {
    return new TeacherAssignmentError(businessCode, err.message || fallbackMessage);
  }

  const code = err.code;
  let mappedCode: TeacherAssignmentErrorType = 'INTERNAL_ERROR';

  if (code === 'unauthenticated') {
    mappedCode = 'UNAUTHENTICATED';
  } else if (code === 'permission-denied') {
    mappedCode = 'PERMISSION_DENIED';
  } else if (code === 'invalid-argument') {
    mappedCode = 'INVALID_ARGUMENT';
  } else if (code === 'failed-precondition') {
    mappedCode = 'ASSIGNMENT_INTEGRITY_ERROR';
  }

  return new TeacherAssignmentError(mappedCode, err.message || 'Une erreur serveur est survenue.');
}

export interface GetTeacherAssignmentCandidatesInput {
  schoolId: string;
}

export interface TeacherAssignmentCandidate {
  teacherStaffId: string;
  name: string;
  operationalStatus?: 'actif' | 'absent' | 'remplacé';
  isEligible: boolean;
  accountStatus: 'linked' | 'unlinked' | 'inactive' | 'inconsistent';
}

export interface GetTeacherAssignmentCandidatesOutput {
  candidates: TeacherAssignmentCandidate[];
}

export async function getTeacherAssignmentCandidates(
  input: GetTeacherAssignmentCandidatesInput
): Promise<GetTeacherAssignmentCandidatesOutput> {
  const functionsInstance = getFunctions();
  const callable = httpsCallable<GetTeacherAssignmentCandidatesInput, GetTeacherAssignmentCandidatesOutput>(
    functionsInstance,
    'getTeacherAssignmentCandidates'
  );

  try {
    const response = await callable(input);
    return response.data;
  } catch (error: unknown) {
    throw parseTeacherAssignmentError(error, 'Erreur lors de la récupération des candidats enseignants.');
  }
}
