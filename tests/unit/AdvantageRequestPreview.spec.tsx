/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import AdvantageRequestPreview from '../../src/components/AdvantageRequestPreview';
import { formatCurrency as currency } from '../../src/utils/paymentReceipt';
import type { AdvantageTarget } from '../../src/components/StudentAccountBenefitsDrawer';

const formatCurrency = (value: number) => currency(value).replace(/\s/g, ' ');
const target: AdvantageTarget = {
  key: 'tuition:T1', type: 'tuition', label: 'Scolarité T1', installment: 'T1', period: null,
  originalDueDate: '2026-10-05', effectiveDueDate: '2026-10-15',
  netExpectedAmount: 60000, remainingBalance: 48000
};
afterEach(cleanup);
describe('Informational advantage preview', () => {
  it('shows fixed reduction without changing the authoritative target', () => {
    const frozen = Object.freeze({ ...target });
    render(<AdvantageRequestPreview target={frozen} moratorium={false} mode="FIXED_AMOUNT" value="12000" newDueDate="" />);
    expect(screen.getByText(formatCurrency(60000))).toBeTruthy();
    expect(screen.getByText(`−${formatCurrency(12000)}`)).toBeTruthy();
    expect(screen.getByText(formatCurrency(48000))).toBeTruthy();
    expect(screen.getByText(/ne modifiera le compte.*qu'après approbation/)).toBeTruthy();
    expect(frozen.netExpectedAmount).toBe(60000);
  });
  it('labels percentage arithmetic as an estimate, not a quote', () => {
    render(<AdvantageRequestPreview target={target} moratorium={false} mode="PERCENTAGE" value="10" newDueDate="" />);
    expect(screen.getByText('−10 %')).toBeTruthy();
    expect(screen.getByText(`−${formatCurrency(6000)}`)).toBeTruthy();
    expect(screen.getByText(formatCurrency(54000))).toBeTruthy();
    expect(screen.getByText(/Estimation indicative/)).toBeTruthy();
  });
  it.each(['', '-1', '101', '1.5', 'NaN'])('does not invent a percentage estimate for invalid value %s', value => {
    render(<AdvantageRequestPreview target={target} moratorium={false} mode="PERCENTAGE" value={value} newDueDate="" />);
    expect(screen.getByText('Estimation non disponible')).toBeTruthy();
  });
  it('does not synthesize an annual total or a negative tariff', () => {
    const { rerender } = render(<AdvantageRequestPreview target={{ ...target, netExpectedAmount: undefined }} moratorium={false} mode="FIXED_AMOUNT" value="100" newDueDate="" />);
    expect(screen.getByText('Non disponible pour ce périmètre')).toBeTruthy();
    rerender(<AdvantageRequestPreview target={target} moratorium={false} mode="FIXED_AMOUNT" value="70000" newDueDate="" />);
    expect(screen.getByText('Estimation non disponible')).toBeTruthy();
  });
  it('uses server remaining amount and effective date unchanged for a moratorium', () => {
    render(<AdvantageRequestPreview target={target} moratorium mode="PERCENTAGE" value="10" newDueDate="2026-11-05" />);
    expect(screen.getByText(`${formatCurrency(48000)} — INCHANGÉ`)).toBeTruthy();
    expect(screen.getByText('15/10/2026')).toBeTruthy();
    expect(screen.getByText('05/11/2026')).toBeTruthy();
    expect(screen.queryByText('Réduction demandée')).toBeNull();
    expect(screen.getByText(/ne réduit pas le montant dû/)).toBeTruthy();
  });
});
