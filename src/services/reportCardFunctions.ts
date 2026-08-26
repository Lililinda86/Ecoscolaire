import { collection, getDocs, getFirestore, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { ReportCard } from '../types';

export type ReportCardAction = 'GENERATE_DRAFT' | 'REFRESH_DRAFT' | 'VALIDATE' | 'PUBLISH';

export interface ManageReportCardInput {
  action: ReportCardAction;
  schoolId: string;
  reportCardId?: string;
  academicYearId?: string;
  periodId?: string;
  classId?: string;
  studentId?: string;
  expectedVersion?: number;
  directorComment?: string;
  testFixture?: true;
  testRunId?: string;
}

export interface ManageReportCardOutput {
  success: true;
  changed: boolean;
  reportCard: ReportCard;
}

export class ReportCardEngineError extends Error {
  businessCode: string;
  constructor(businessCode: string, message: string) {
    super(message);
    this.name = 'ReportCardEngineError';
    this.businessCode = businessCode;
  }
}

const parseError = (error: unknown): ReportCardEngineError => {
  const value = error as { details?: { businessCode?: string }; message?: string; code?: string };
  return new ReportCardEngineError(
    value.details?.businessCode || value.code || 'INTERNAL_ERROR',
    value.message || 'Erreur lors de la gestion du bulletin.',
  );
};

export const manageReportCard = async (input: ManageReportCardInput): Promise<ManageReportCardOutput> => {
  const callable = httpsCallable<ManageReportCardInput, ManageReportCardOutput>(getFunctions(), 'manageReportCard');
  try {
    return (await callable(input)).data;
  } catch (error) {
    throw parseError(error);
  }
};

export const getSchoolReportCards = async (schoolId: string): Promise<ReportCard[]> => {
  const snapshot = await getDocs(query(collection(getFirestore(), 'reportCards'), where('schoolId', '==', schoolId)));
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() } as ReportCard));
};
