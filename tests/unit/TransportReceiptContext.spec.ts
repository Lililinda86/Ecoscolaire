import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('immutable Transport receipt context contract', () => {
  const backend = readFileSync('functions/src/secretaryCollections.ts', 'utf8');
  const pdf = readFileSync('src/components/ReceiptPDFTemplate.tsx', 'utf8');
  const history = readFileSync('src/components/ReceiptHistory.tsx', 'utf8');

  it('snapshots only new canonical Transport receipts from server-resolved data', () => {
    expect(backend).toMatch(/const transportContext = transportQuote \? \{/);
    for (const field of [
      'zonePk', 'neighborhood', 'pickupPoint', 'feePolicyId',
      'monthlyGrossAmount', 'transportState', 'billingPeriods'
    ]) expect(backend).toMatch(new RegExp(`${field}:`));
    expect(backend).toMatch(/\.\.\.\(transportContext \? \{ transportContext \} : \{\}\)/);
    expect(backend).toMatch(/originalReceipt\.transportContext/);
  });

  it('renders the immutable snapshot in history and PDF without mutating old receipts', () => {
    expect(pdf).toContain('data-testid="transport-receipt-context"');
    expect(history).toContain('transport-receipt-context-${displayModel.id}');
    expect(pdf).toMatch(/displayModel\.transportContext\.zonePk/);
    expect(history).toMatch(/displayModel\.transportContext\.pickupPoint/);
    expect(backend).not.toMatch(/(?:update|set)\([^\n]*historical receipt/i);
  });
});
