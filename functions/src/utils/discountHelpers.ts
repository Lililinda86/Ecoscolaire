import { createHash } from 'node:crypto';
import type { TuitionInstallment } from '../models/discounts.ts';

export const isTuitionInstallment = (value: unknown): value is TuitionInstallment => {
  return value === 'T1' || value === 'T2' || value === 'T3';
};

export interface TuitionDiscountAmounts {
  grossExpectedAmount: number;
  discountAmount: number;
  netExpectedAmount: number;
}

export const calculateTuitionDiscountAmounts = (
  grossExpectedAmount: number,
  discountAmount: number
): TuitionDiscountAmounts => {
  if (
    !Number.isFinite(grossExpectedAmount) ||
    !Number.isSafeInteger(grossExpectedAmount) ||
    grossExpectedAmount <= 0
  ) {
    throw new Error('Le montant attendu brut doit être un entier positif sûr.');
  }

  if (
    !Number.isFinite(discountAmount) ||
    !Number.isSafeInteger(discountAmount) ||
    discountAmount <= 0
  ) {
    throw new Error('Le montant de la réduction doit être un entier positif sûr.');
  }

  if (discountAmount >= grossExpectedAmount) {
    throw new Error('Le montant de la réduction doit être strictement inférieur au montant brut.');
  }

  if (grossExpectedAmount > Number.MAX_SAFE_INTEGER || discountAmount > Number.MAX_SAFE_INTEGER) {
    throw new Error('Les montants dépassent la limite de sécurité Number.MAX_SAFE_INTEGER.');
  }

  const netExpectedAmount = grossExpectedAmount - discountAmount;
  if (!Number.isSafeInteger(netExpectedAmount) || netExpectedAmount <= 0) {
    throw new Error('Le montant net calculé est invalide.');
  }

  return {
    grossExpectedAmount,
    discountAmount,
    netExpectedAmount
  };
};

export const getTuitionPaidField = (installment: TuitionInstallment): 'tuitionPaidT1' | 'tuitionPaidT2' | 'tuitionPaidT3' => {
  if (installment === 'T1') return 'tuitionPaidT1';
  if (installment === 'T2') return 'tuitionPaidT2';
  return 'tuitionPaidT3';
};

export const getTuitionDiscountField = (installment: TuitionInstallment): 'tuitionDiscountT1' | 'tuitionDiscountT2' | 'tuitionDiscountT3' => {
  if (installment === 'T1') return 'tuitionDiscountT1';
  if (installment === 'T2') return 'tuitionDiscountT2';
  return 'tuitionDiscountT3';
};

export const makeTuitionDiscountSlotId = ({
  schoolId,
  studentId,
  academicYear,
  installment
}: {
  schoolId: string;
  studentId: string;
  academicYear: string;
  installment: TuitionInstallment;
}): string => {
  if (!schoolId || typeof schoolId !== 'string' || schoolId.trim() === '') {
    throw new Error('schoolId invalide.');
  }
  if (!studentId || typeof studentId !== 'string' || studentId.trim() === '') {
    throw new Error('studentId invalide.');
  }
  if (!academicYear || typeof academicYear !== 'string' || academicYear.trim() === '') {
    throw new Error('academicYear invalide.');
  }
  if (!isTuitionInstallment(installment)) {
    throw new Error('installment invalide.');
  }

  const canonical = JSON.stringify({
    schoolId: schoolId.trim(),
    studentId: studentId.trim(),
    academicYear: academicYear.trim(),
    installment
  });

  const sha256 = createHash('sha256').update(canonical).digest('hex');
  return `slot_${sha256}`;
};

export const makeTuitionDiscountCounterId = ({
  schoolId,
  academicYear
}: {
  schoolId: string;
  academicYear: string;
}): string => {
  if (!schoolId || typeof schoolId !== 'string' || schoolId.trim() === '') {
    throw new Error('schoolId invalide.');
  }
  if (!academicYear || typeof academicYear !== 'string' || academicYear.trim() === '') {
    throw new Error('academicYear invalide.');
  }

  const canonical = JSON.stringify({
    schoolId: schoolId.trim(),
    academicYear: academicYear.trim()
  });

  const sha256 = createHash('sha256').update(canonical).digest('hex');
  return `counter_${sha256}`;
};
