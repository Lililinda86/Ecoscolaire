import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/Payments.tsx', 'utf8');

describe('Payments student class context', () => {
  it('derives the displayed class from the currently selected student', () => {
    expect(source).toMatch(/selectedPaymentStudent = db\.students\.find\(student => student\.id === currentPayment\.studentId\)/);
    expect(source).toMatch(/selectedPaymentClass = db\.classes\.find\(classSection => classSection\.id === selectedPaymentStudent\?\.classId\)/);
    expect(source).toMatch(/selectedPaymentStudent && \([\s\S]*?data-testid="payment-student-class"[\s\S]*?selectedPaymentClass\?\.name/);
  });

  it('renders class context as read-only information', () => {
    const display = source.match(/data-testid="payment-student-class"[\s\S]*?<\/div>/)?.[0] || '';
    expect(display).toContain('<strong>Classe :</strong>');
    expect(display).not.toMatch(/<(?:input|select|textarea|button)/);
  });

  it('keeps the server quote authoritative for every financial amount', () => {
    expect(source).toMatch(/httpsCallable<Record<string, unknown>, CollectionQuote>\(functions, 'getCollectionQuote'\)/);
    expect(source).toMatch(/collectionQuote\.grossExpectedAmount/);
    expect(source).not.toMatch(/Montant attendu/);
  });
});
