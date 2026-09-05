import { describe, expect, it } from 'vitest';
import { buildReceiptDisplayModel, translatePaymentType } from '../../src/utils/paymentReceipt';

describe('student account multi-fee receipt', () => {
  it('preserves every immutable allocation line on a global receipt', () => {
    const model = buildReceiptDisplayModel({
      id: 'collection-1',
      paymentId: 'collection-1',
      receiptNumber: 'REC-2026-0042',
      schoolId: 'school-a',
      studentId: 'student-a',
      studentName: 'Élève Test',
      className: 'CP',
      academicYear: '2026-2027',
      type: 'collection',
      method: 'cash',
      amount: 50000,
      lineItems: [
        { key: 'tuition:T1', type: 'tuition', label: 'Scolarité T1', amount: 30000, remainingBalance: 20000 },
        { key: 'transport', type: 'transport', label: 'Transport', amount: 5000, remainingBalance: 0 },
        { key: 'uniforms', type: 'uniforms', label: 'Tenue scolaire', amount: 15000, remainingBalance: 0 }
      ]
    }, [], []);

    expect(model.nature).toBe('Encaissement multi-frais');
    expect(model.formattedAmount).toContain('50');
    expect(model.lineItems).toEqual([
      { key: 'tuition:T1', type: 'tuition', label: 'Scolarité T1', amount: 30000, remainingBalance: 20000 },
      { key: 'transport', type: 'transport', label: 'Transport', amount: 5000, remainingBalance: 0 },
      { key: 'uniforms', type: 'uniforms', label: 'Tenue scolaire', amount: 15000, remainingBalance: 0 }
    ]);
  });

  it('keeps historical receipts readable when no lineItems field exists', () => {
    const model = buildReceiptDisplayModel({ id: 'legacy', paymentId: 'legacy', type: 'tuition', amount: 1000 }, [], []);
    expect(model.lineItems).toEqual([]);
    expect(translatePaymentType('tuition')).toBe('Frais de scolarité');
  });
});
