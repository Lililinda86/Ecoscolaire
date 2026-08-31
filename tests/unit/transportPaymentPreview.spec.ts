import { describe, expect, it } from 'vitest';
import { buildTransportPaymentPreview } from '../../src/utils/transportPaymentPreview';

const periods = [
  { period: '2026-09', remainingBalance: 2000 },
  { period: '2026-10', remainingBalance: 4000 },
  { period: '2026-11', remainingBalance: 4000 }
];

describe('server-quote transport payment preview', () => {
  it('allocates a partial payment to the oldest outstanding period', () => {
    expect(buildTransportPaymentPreview(periods, 1500, 0).allocations).toEqual([
      { kind: 'INSTALLMENT', period: '2026-09', amount: 1500 }
    ]);
  });

  it('allocates across configured periods without recomputing their tariffs', () => {
    expect(buildTransportPaymentPreview(periods, 5000, 0).allocations).toEqual([
      { kind: 'INSTALLMENT', period: '2026-09', amount: 2000 },
      { kind: 'INSTALLMENT', period: '2026-10', amount: 3000 }
    ]);
  });

  it('preserves existing credit and exposes only the newly generated excess', () => {
    const preview = buildTransportPaymentPreview(periods, 12_000, 750);
    expect(preview.allocations.at(-1)).toEqual({ kind: 'CREDIT', period: null, amount: 2000 });
    expect(preview.existingCredit).toBe(750);
    expect(preview.generatedCredit).toBe(2000);
    expect(preview.finalCredit).toBe(2750);
  });

  it('fails closed on malformed server quote amounts', () => {
    expect(() => buildTransportPaymentPreview([
      { period: '2026-09', remainingBalance: -1 }
    ], 1000, 0)).toThrow(/remainingBalance/);
    expect(() => buildTransportPaymentPreview(periods, 1000, -1)).toThrow(/existingCredit/);
  });
});
