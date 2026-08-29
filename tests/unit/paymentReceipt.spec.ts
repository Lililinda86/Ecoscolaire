import { describe, expect, it } from 'vitest';
import { buildReceiptDisplayModel, isOperationalMobileMoneyProvider } from '../../src/utils/paymentReceipt';

describe('secure collection receipt display model', () => {
  it('renders the immutable financial and transport snapshots stored on the receipt', () => {
    const model = buildReceiptDisplayModel({
      id: 'receipt-1', paymentId: 'payment-1', receiptNumber: 'REC-2026-0001',
      schoolId: 'school-1', studentId: 'student-1', schoolName: 'École fictive',
      studentName: 'Élève fictif', studentRegistrationNumber: 'TEST-001',
      className: 'CP', academicYear: '2026-2027', type: 'transport', period: '2026-09',
      method: 'cash', amount: 3000, expectedAmount: 5000,
      grossExpectedAmount: 6000, discountAmount: 1000, netExpectedAmount: 5000,
      previousPaid: 0, newPaid: 3000, remainingBalance: 2000,
      collectedByName: 'Secrétaire fictive',
      benefits: [{
        benefitId: 'benefit-1', benefitType: 'DISCOUNT_VOUCHER', reference: 'BON-TEST-001',
        mode: 'FIXED_AMOUNT', value: 1000, discountAmount: 1000
      }],
      allocationSummary: [
        { kind: 'INSTALLMENT', period: '2026-09', amount: 3000 },
        { kind: 'CREDIT', period: null, amount: 500 }
      ],
      transportCredit: 500,
      createdAt: '2026-09-10T12:00:00.000Z'
    }, [], []);

    expect(model.period).toBe('2026-09');
    expect(model.formattedGrossExpectedAmount).toContain('6');
    expect(model.formattedDiscountAmount).toContain('1');
    expect(model.formattedNetExpectedAmount).toContain('5');
    expect(model.formattedRemainingBalance).toContain('2');
    expect(model.collectedByName).toBe('Secrétaire fictive');
    expect(model.allocations).toEqual([
      { kind: 'INSTALLMENT', period: '2026-09', amount: 3000 },
      { kind: 'CREDIT', period: null, amount: 500 }
    ]);
    expect(model.transportCredit).toBe(500);
    expect(model.formattedTransportCredit).toContain('500');
    expect(model.benefits).toEqual([expect.objectContaining({
      benefitType: 'DISCOUNT_VOUCHER', reference: 'BON-TEST-001', discountAmount: 1000
    })]);
  });

  it('fails closed when no operational Mobile Money provider is configured', () => {
    expect(isOperationalMobileMoneyProvider('campay')).toBe(true);
    expect(isOperationalMobileMoneyProvider('flutterwave')).toBe(true);
    expect(isOperationalMobileMoneyProvider('none')).toBe(false);
    expect(isOperationalMobileMoneyProvider(undefined)).toBe(false);
  });

  it('identifies an immutable correction receipt and preserves its traceability', () => {
    const model = buildReceiptDisplayModel({
      id: 'reversal-1', paymentId: 'reversal-1', receiptNumber: 'ANN-REC-2026-0001',
      studentId: 'student-1', type: 'tuition', installment: 'T1', amount: -30000,
      expectedAmount: 60000, previousPaid: 60000, newPaid: 30000, remainingBalance: 30000,
      kind: 'PAYMENT_REVERSAL', originalPaymentId: 'payment-1', reason: 'Erreur de saisie',
      correctedByRole: 'owner'
    }, [], []);
    expect(model.isCorrection).toBe(true);
    expect(model.correctionReason).toBe('Erreur de saisie');
    expect(model.originalPaymentId).toBe('payment-1');
    expect(model.amount).toBe(-30000);
    expect(model.collectedByName).toBe('owner');
  });
});
