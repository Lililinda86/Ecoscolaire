export interface TransportQuoteInstallmentPreviewInput {
  period: string;
  remainingBalance: number;
}

export interface TransportPaymentPreviewAllocation {
  kind: 'INSTALLMENT' | 'CREDIT';
  period: string | null;
  amount: number;
}

export interface TransportPaymentPreview {
  allocations: TransportPaymentPreviewAllocation[];
  existingCredit: number;
  generatedCredit: number;
  finalCredit: number;
}

const requireNonNegativeSafeInteger = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer.`);
  }
  return value;
};

/**
 * Builds an informational allocation preview exclusively from the server quote.
 * The callable remains authoritative and recomputes the final allocation in its transaction.
 */
export const buildTransportPaymentPreview = (
  installments: TransportQuoteInstallmentPreviewInput[],
  paymentAmount: number,
  existingCredit: number
): TransportPaymentPreview => {
  let unallocated = requireNonNegativeSafeInteger(paymentAmount, 'paymentAmount');
  const currentCredit = requireNonNegativeSafeInteger(existingCredit, 'existingCredit');
  const allocations: TransportPaymentPreviewAllocation[] = [];

  for (const installment of installments) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(installment.period)) {
      throw new Error('installment.period must use YYYY-MM.');
    }
    const remainingBalance = requireNonNegativeSafeInteger(
      installment.remainingBalance,
      `remainingBalance:${installment.period}`
    );
    if (unallocated === 0 || remainingBalance === 0) continue;
    const amount = Math.min(unallocated, remainingBalance);
    allocations.push({ kind: 'INSTALLMENT', period: installment.period, amount });
    unallocated -= amount;
  }

  if (unallocated > 0) {
    allocations.push({ kind: 'CREDIT', period: null, amount: unallocated });
  }

  return {
    allocations,
    existingCredit: currentCredit,
    generatedCredit: unallocated,
    finalCredit: currentCredit + unallocated
  };
};
