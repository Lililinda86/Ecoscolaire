export type ExpenseAmountRow = {
  amount?: number;
  status?: string;
};

export type PaymentAmountRow = {
  amount?: number;
  status?: string;
  method?: string;
  kind?: string;
  originalPaymentId?: string;
};

export const calculateCollectedPaymentTotal = (
  rows: PaymentAmountRow[],
  method?: 'cash' | 'mobile_money',
): number => rows.reduce((sum, row) => {
  const status = typeof row.status === 'string' ? row.status.toLowerCase() : 'completed';
  if (['pending', 'failed', 'cancelled', 'canceled', 'refunded', 'reversed'].includes(status)) return sum;
  if (method && (row.method || 'cash').toLowerCase() !== method) return sum;
  if (typeof row.amount !== 'number' || !Number.isSafeInteger(row.amount) || row.amount === 0) return sum;
  if (row.amount < 0) {
    return row.kind === 'PAYMENT_REVERSAL' && typeof row.originalPaymentId === 'string'
      ? sum + row.amount
      : sum;
  }
  return row.kind === 'PAYMENT_REVERSAL' ? sum : sum + row.amount;
}, 0);

export const calculateNetExpenseTotal = (rows: ExpenseAmountRow[]): number => rows.reduce((sum, row) => {
  const status = typeof row.status === 'string' ? row.status.toUpperCase() : 'POSTED';
  if (status === 'DRAFT' || ['CANCELLED', 'CANCELED', 'REJECTED'].includes(status)) return sum;
  return typeof row.amount === 'number' && Number.isSafeInteger(row.amount) ? sum + row.amount : sum;
}, 0);
