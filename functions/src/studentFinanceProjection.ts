import {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  FieldValue,
  Transaction
} from 'firebase-admin/firestore';

const FINANCE_FIELDS = [
  'feeAmount',
  'feeT1',
  'feeT2',
  'feeT3',
  'feeTransport',
  'feeUniforms',
  'financialBypass',
  'registrationFeeExpected',
  'registrationFeePaid',
  'registrationFeeStatus',
  'tuitionExpected',
  'tuitionPaid',
  'tuitionStatus',
  'transportMonthlyFee',
  'transportPaid'
] as const;

export type StudentFinanceData = Record<string, unknown>;

export const resolveStudentFinanceData = (
  legacyStudent: DocumentData,
  financeSnapshot: DocumentSnapshot
): StudentFinanceData => {
  const finance: StudentFinanceData = {};

  // Legacy public values remain readable until a separate migration is run, but
  // are never copied wholesale into the private projection by this helper.
  for (const field of FINANCE_FIELDS) {
    if (legacyStudent[field] !== undefined) {
      finance[field] = legacyStudent[field];
    }
  }

  if (financeSnapshot.exists) {
    Object.assign(finance, financeSnapshot.data() ?? {});
  }

  return finance;
};

export const writeStudentFinanceProjection = ({
  transaction,
  financeRef,
  financeSnapshot,
  studentId,
  schoolId,
  patch,
  actorId
}: {
  transaction: Transaction;
  financeRef: DocumentReference;
  financeSnapshot: DocumentSnapshot;
  studentId: string;
  schoolId: string;
  patch: DocumentData;
  actorId: string;
}): void => {
  if (financeSnapshot.exists) {
    const existing = financeSnapshot.data() ?? {};
    if (existing.id !== studentId || existing.studentId !== studentId || existing.schoolId !== schoolId) {
      throw new Error('Student finance projection identity mismatch.');
    }

    transaction.update(financeRef, {
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorId
    });
    return;
  }

  transaction.set(financeRef, {
    id: studentId,
    studentId,
    schoolId,
    ...patch,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actorId,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorId
  });
};
