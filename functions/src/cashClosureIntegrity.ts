type Data = Record<string, unknown>;

export const CASH_LEDGER_COLLECTION = 'cashLedgerDays';

export const makeCashLedgerDayId = (schoolId: string, date: string): string => `${schoolId}__${date}`;

export class CashLedgerIntegrityError extends Error {
  constructor(
    readonly businessCode: 'CASH_DAY_CLOSED' | 'CASH_LEDGER_INCONSISTENT',
    message: string,
  ) {
    super(message);
    this.name = 'CashLedgerIntegrityError';
  }
}

const requireLedgerIdentity = (ledger: Data, schoolId: string, date: string): number => {
  if (ledger.schoolId !== schoolId || ledger.date !== date) {
    throw new CashLedgerIntegrityError(
      'CASH_LEDGER_INCONSISTENT',
      'Cash ledger tenant/date identity is inconsistent.',
    );
  }
  const cashReceived = ledger.cashReceived;
  if (typeof cashReceived !== 'number' || !Number.isSafeInteger(cashReceived)) {
    throw new CashLedgerIntegrityError(
      'CASH_LEDGER_INCONSISTENT',
      'Cash ledger total is not a safe integer.',
    );
  }
  return cashReceived;
};

/**
 * Returns the current net cash total for an open school/day ledger.
 * A missing ledger is the valid zero state for a day with no canonical cash event.
 */
export const requireOpenCashLedger = (
  ledger: Data | null,
  closureExists: boolean,
  schoolId: string,
  date: string,
): number => {
  if (closureExists || ledger?.status === 'closed') {
    throw new CashLedgerIntegrityError(
      'CASH_DAY_CLOSED',
      'Cash events are immutable after the school day is closed.',
    );
  }
  if (!ledger) return 0;
  if (ledger.status !== 'open') {
    throw new CashLedgerIntegrityError(
      'CASH_LEDGER_INCONSISTENT',
      'Cash ledger has an unsupported state.',
    );
  }
  return requireLedgerIdentity(ledger, schoolId, date);
};

/**
 * Legacy-safe closing check: a missing ledger is accepted and initialized from
 * the canonical payments query, while an existing ledger must match exactly.
 */
export const requireCashLedgerTotalAtClose = (
  ledger: Data | null,
  schoolId: string,
  date: string,
  calculatedCashReceived: number,
): void => {
  if (!Number.isSafeInteger(calculatedCashReceived)) {
    throw new CashLedgerIntegrityError(
      'CASH_LEDGER_INCONSISTENT',
      'Calculated cash total is not a safe integer.',
    );
  }
  if (!ledger) return;
  if (ledger.status !== 'open') {
    throw new CashLedgerIntegrityError(
      'CASH_LEDGER_INCONSISTENT',
      'Cash ledger cannot be closed from its current state.',
    );
  }
  const ledgerCashReceived = requireLedgerIdentity(ledger, schoolId, date);
  if (ledgerCashReceived !== calculatedCashReceived) {
    throw new CashLedgerIntegrityError(
      'CASH_LEDGER_INCONSISTENT',
      'Cash ledger total differs from canonical cash payments.',
    );
  }
};
