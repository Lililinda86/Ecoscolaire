import type { TuitionInstallment } from '../types/index.ts';

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
