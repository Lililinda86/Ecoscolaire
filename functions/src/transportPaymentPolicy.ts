export type TransportCycle = 'nursery' | 'primary' | 'secondary' | 'unknown';

export const ITALO_TRANSPORT_FEE_POLICY_ID = 'ITALO_PK_2026';

export interface TransportFeeResolution {
  state: 'FREE_SECONDARY' | 'NOT_SUBSCRIBED' | 'BILLABLE';
  zonePk: number | null;
  monthlyGrossAmount: number;
}

export interface TransportInstallmentBalance {
  period: string;
  remainingBalance: number;
}

export interface TransportAllocationPlanItem {
  kind: 'INSTALLMENT' | 'CREDIT';
  period: string | null;
  amount: number;
}

export interface TransportAllocationPlan {
  allocations: TransportAllocationPlanItem[];
  allocatedAmount: number;
  creditAmount: number;
}

export const resolveItaloTransportFee = ({
  cycle, usesTransport, zonePk, rates
}: {
  cycle: TransportCycle;
  usesTransport: boolean;
  zonePk: unknown;
  rates?: { pk14To33: number; pk34To42: number };
}): TransportFeeResolution => {
  if (cycle === 'secondary') {
    return { state: 'FREE_SECONDARY', zonePk: null, monthlyGrossAmount: 0 };
  }
  if (!usesTransport) {
    return { state: 'NOT_SUBSCRIBED', zonePk: null, monthlyGrossAmount: 0 };
  }
  if (cycle !== 'primary' && cycle !== 'nursery') {
    throw new Error('TRANSPORT_CLASS_NOT_SUPPORTED');
  }
  if (typeof zonePk !== 'number' || !Number.isSafeInteger(zonePk)) {
    throw new Error('TRANSPORT_ZONE_REQUIRED');
  }
  if (zonePk >= 14 && zonePk <= 33) {
    const amount = rates === undefined ? 4000 : rates.pk14To33;
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('TRANSPORT_RATE_INVALID');
    return { state: 'BILLABLE', zonePk, monthlyGrossAmount: amount };
  }
  if (zonePk >= 34 && zonePk <= 42) {
    const amount = rates === undefined ? 5000 : rates.pk34To42;
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('TRANSPORT_RATE_INVALID');
    return { state: 'BILLABLE', zonePk, monthlyGrossAmount: amount };
  }
  throw new Error('TRANSPORT_ZONE_OUTSIDE_POLICY');
};

export const planTransportAllocations = (
  installments: TransportInstallmentBalance[],
  paymentAmount: number
): TransportAllocationPlan => {
  if (!Number.isSafeInteger(paymentAmount) || paymentAmount <= 0) {
    throw new Error('INVALID_PAYMENT_AMOUNT');
  }
  const ordered = [...installments].sort((left, right) => left.period.localeCompare(right.period));
  if (new Set(ordered.map(item => item.period)).size !== ordered.length) {
    throw new Error('DUPLICATE_TRANSPORT_PERIOD');
  }
  let remainingPayment = paymentAmount;
  const allocations: TransportAllocationPlanItem[] = [];
  for (const installment of ordered) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(installment.period)
        || !Number.isSafeInteger(installment.remainingBalance) || installment.remainingBalance < 0) {
      throw new Error('INVALID_TRANSPORT_INSTALLMENT');
    }
    if (remainingPayment === 0) break;
    const amount = Math.min(remainingPayment, installment.remainingBalance);
    if (amount > 0) {
      allocations.push({ kind: 'INSTALLMENT', period: installment.period, amount });
      remainingPayment -= amount;
    }
  }
  if (remainingPayment > 0) {
    allocations.push({ kind: 'CREDIT', period: null, amount: remainingPayment });
  }
  return {
    allocations,
    allocatedAmount: paymentAmount - remainingPayment,
    creditAmount: remainingPayment
  };
};
