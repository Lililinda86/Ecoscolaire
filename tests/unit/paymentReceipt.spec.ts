import { describe, expect, it } from 'vitest';
import { buildReceiptDisplayModel } from '../../src/utils/paymentReceipt';

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
      createdAt: '2026-09-10T12:00:00.000Z'
    }, [], []);

    expect(model.period).toBe('2026-09');
    expect(model.formattedGrossExpectedAmount).toContain('6');
    expect(model.formattedDiscountAmount).toContain('1');
    expect(model.formattedNetExpectedAmount).toContain('5');
    expect(model.formattedRemainingBalance).toContain('2');
    expect(model.collectedByName).toBe('Secrétaire fictive');
    expect(model.benefits).toEqual([expect.objectContaining({
      benefitType: 'DISCOUNT_VOUCHER', reference: 'BON-TEST-001', discountAmount: 1000
    })]);
  });
});
