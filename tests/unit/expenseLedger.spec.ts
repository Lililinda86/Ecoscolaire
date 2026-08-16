import { describe, expect, it } from 'vitest';
import { calculateCollectedPaymentTotal, calculateNetExpenseTotal } from '../../src/utils/expenseLedger';

describe('expense ledger KPI', () => {
  it('deducts one reversal exactly once and ignores drafts', () => {
    expect(calculateNetExpenseTotal([
      { amount: 5000, status: 'POSTED' },
      { amount: -5000, status: 'REVERSED' },
      { amount: 9000, status: 'DRAFT' },
    ])).toBe(0);
  });

  it('keeps legacy expenses as posted entries', () => {
    expect(calculateNetExpenseTotal([{ amount: 5000 }])).toBe(5000);
  });

  it('counts each successful collection once and excludes non-settled payments', () => {
    expect(calculateCollectedPaymentTotal([
      { amount: 5000, method: 'cash', status: 'completed' },
      { amount: 5000, method: 'cash', status: 'pending' },
      { amount: 5000, method: 'mobile_money', status: 'SUCCESS' },
      { amount: 5000, method: 'mobile_money', status: 'reversed' },
    ])).toBe(10000);
  });
});
