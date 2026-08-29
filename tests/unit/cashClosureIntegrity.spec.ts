import { describe, expect, it } from 'vitest';
import {
  CashLedgerIntegrityError,
  makeCashLedgerDayId,
  requireCashLedgerTotalAtClose,
  requireOpenCashLedger,
} from '../../functions/src/cashClosureIntegrity';

const schoolId = 'school-a';
const date = '2026-08-29';
const openLedger = {
  id: makeCashLedgerDayId(schoolId, date),
  schoolId,
  date,
  status: 'open',
  cashReceived: 7_000,
};

describe('cash closure integrity invariant', () => {
  it('uses one deterministic tenant/day serialization identity', () => {
    expect(makeCashLedgerDayId(schoolId, date)).toBe('school-a__2026-08-29');
  });

  it('accepts a missing or valid open ledger before a cash event', () => {
    expect(requireOpenCashLedger(null, false, schoolId, date)).toBe(0);
    expect(requireOpenCashLedger(openLedger, false, schoolId, date)).toBe(7_000);
  });

  it('denies every cash event once either the closure or closed ledger exists', () => {
    expect(() => requireOpenCashLedger(openLedger, true, schoolId, date))
      .toThrowError(expect.objectContaining({ businessCode: 'CASH_DAY_CLOSED' }));
    expect(() => requireOpenCashLedger({ ...openLedger, status: 'closed' }, false, schoolId, date))
      .toThrowError(expect.objectContaining({ businessCode: 'CASH_DAY_CLOSED' }));
  });

  it('fails closed for a cross-school, cross-date, malformed or unknown-state ledger', () => {
    for (const ledger of [
      { ...openLedger, schoolId: 'school-b' },
      { ...openLedger, date: '2026-08-30' },
      { ...openLedger, cashReceived: 1.5 },
      { ...openLedger, status: 'unknown' },
    ]) {
      expect(() => requireOpenCashLedger(ledger, false, schoolId, date))
        .toThrowError(CashLedgerIntegrityError);
    }
  });

  it('allows legacy close without a ledger but requires exact equality when one exists', () => {
    expect(() => requireCashLedgerTotalAtClose(null, schoolId, date, 7_000)).not.toThrow();
    expect(() => requireCashLedgerTotalAtClose(openLedger, schoolId, date, 7_000)).not.toThrow();
    expect(() => requireCashLedgerTotalAtClose(openLedger, schoolId, date, 6_999))
      .toThrowError(expect.objectContaining({ businessCode: 'CASH_LEDGER_INCONSISTENT' }));
  });
});
