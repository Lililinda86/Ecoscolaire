import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/Payments.tsx', 'utf8');

describe('Payments Transport context', () => {
  it('renders the selected student Transport data as read-only context', () => {
    const context = source.match(/data-testid="transport-student-context"[\s\S]*?<\/section>/)?.[0] || '';
    for (const testId of [
      'transport-student-class', 'transport-zone-pk', 'transport-neighborhood',
      'transport-pickup', 'transport-status'
    ]) expect(context).toContain(`data-testid="${testId}"`);
    expect(context).toContain('Le point de ramassage est informatif');
    expect(context).not.toMatch(/<(?:input|select|textarea|button)/);
  });

  it('uses only server quote fields for policy, tariff and configured periods', () => {
    expect(source).toMatch(/data-testid="transport-policy"[\s\S]*?collectionQuote\.feePolicyId/);
    expect(source).toMatch(/data-testid="transport-rate"[\s\S]*?collectionQuote\.monthlyGrossAmount/);
    expect(source).toMatch(/data-period-source="server-quote"[\s\S]*?collectionQuote\.installments\.map/);
    expect(source).not.toMatch(/transportNeighborhood[\s\S]{0,180}(?:4000|5000)/);
    expect(source).not.toMatch(/transportPickupPoint[\s\S]{0,180}(?:4000|5000)/);
  });

  it('blocks an incomplete primary Transport configuration without blocking the student form', () => {
    expect(source).toMatch(/transportConfigurationIncomplete[\s\S]*?transportStatus === 'needs_configuration'/);
    expect(source).toMatch(/data-testid="transport-configuration-incomplete" role="alert"/);
    expect(source).toMatch(/disabled=\{isProcessingMoMo[\s\S]*?transportConfigurationIncomplete/);
    expect(source).not.toMatch(/transportConfigurationIncomplete[\s\S]{0,120}setCurrentStudent/);
  });

  it('previews allocations from the authoritative installments and preserves existing credit', () => {
    expect(source).toMatch(/buildTransportPaymentPreview\([\s\S]*?collectionQuote\.installments\.map/);
    expect(source).toMatch(/collectionQuote\.transportCredit \|\| 0/);
    for (const testId of [
      'transport-payment-preview', 'transport-preview-allocation', 'transport-existing-credit',
      'transport-generated-credit', 'transport-final-credit'
    ]) expect(source).toContain(`data-testid="${testId}"`);
    expect(source).toContain('le serveur recalcule et valide la ventilation');
  });
});
