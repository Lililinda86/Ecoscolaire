import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/Payments.tsx', 'utf8');

describe('Payments tuition recovery', () => {
  it('derives selectable installments from positive classFees only', () => {
    expect(source).toContain('const getConfiguredClassFeeInstallments');
    expect(source).toContain('Number.isSafeInteger(amount) && amount > 0');
    expect(source).toContain('db.school?.classFees?.[selectedPaymentClass.name]');
    expect(source).toContain('configuredTuitionInstallments.map(installment =>');
  });

  it('keeps the installment control accessible and exact', () => {
    expect(source).toContain('<label htmlFor="tuition-installment-select">Choix de la Tranche</label>');
    expect(source).toContain('data-testid="tuition-installment-select"');
    expect(source).toContain("value={currentPayment.installment || 'T1'}");
  });

  it('invalidates a stale quote for every authoritative target change', () => {
    const start = source.indexOf('React.useLayoutEffect(() => {');
    const end = source.indexOf('  // Fetch a server-side quote.', start);
    const invalidation = source.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(invalidation).toContain('setCollectionQuote(null)');
    expect(invalidation).toContain('setQuoteLoading(targetReady)');
    for (const dependency of [
      'currentPayment.studentId',
      'currentPayment.type',
      'currentPayment.installment',
      'currentPayment.period',
      'currentSchool?.academicYear',
      'currentSchool?.id',
      'quoteRefresh'
    ]) expect(invalidation).toContain(dependency);
  });

  it('renders financial values only from the current server quote', () => {
    expect(source).toContain('!quoteLoading && collectionQuote &&');
    expect(source).toContain('data-testid="collection-quote-current"');
    expect(source).toContain('collectionQuote.grossExpectedAmount');
    expect(source).toContain('collectionQuote.discountAmount');
    expect(source).toContain('collectionQuote.netExpectedAmount');
    expect(source).toContain('collectionQuote.previousPaid');
    expect(source).toContain('collectionQuote.remainingBalance');
  });
});
