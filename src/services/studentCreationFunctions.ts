import { httpsCallable } from 'firebase/functions';
import { functions } from '../db/firebase';

export interface CreateStudentSecureInput {
  studentId: string;
  requestedMatricule?: string;
  confirmProbableDuplicate?: boolean;
  studentData: Record<string, unknown>;
  privateData: Record<string, unknown>;
  financeData: Record<string, unknown>;
  parentPrivateData: Record<string, unknown>;
  parentFinanceData: Record<string, unknown>;
}

export interface CreateStudentSecureResult {
  studentId: string;
  matricule: string;
  matriculeNormalized: string;
  matriculeReservationId: string;
  duplicateFingerprint: string;
  duplicateReservationId: string;
  academicYearId: string;
  registrationYear: string;
  created: boolean;
}

export const createStudentSecure = async (
  input: CreateStudentSecureInput
): Promise<CreateStudentSecureResult> => {
  const callable = httpsCallable<CreateStudentSecureInput, CreateStudentSecureResult>(
    functions,
    'createStudentSecure'
  );
  try {
    const response = await callable(input);
    return response.data;
  } catch (error: unknown) {
    const businessCode = typeof error === 'object' && error !== null && 'details' in error
      && typeof (error as { details?: unknown }).details === 'object'
      && (error as { details?: { businessCode?: unknown } }).details !== null
      && typeof (error as { details: { businessCode?: unknown } }).details.businessCode === 'string'
      ? (error as { details: { businessCode: string } }).details.businessCode
      : undefined;
    if (businessCode) throw new Error(businessCode);
    throw error;
  }
};
