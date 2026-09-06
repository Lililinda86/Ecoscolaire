// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccountFeeGroups } from '../../src/components/AccountFeeGroups';

describe('Grouped authoritative account summaries', () => {
  it('uses server totals and retains each month without calculating a new debt', () => {
    const lines = [{ key: 'transport:2026-09', label: 'Septembre payé' }, { key: 'transport:2026-10', label: 'Octobre à payer' }];
    const { container } = render(<AccountFeeGroups groups={[{ key: 'transport', label: 'Transport', lineKeys: lines.map(l => l.key), totals: { totalBilled: 8000, totalBenefits: 0, totalPaid: 4000, totalRemaining: 4000, overdueAmount: 0 } }]} lines={lines} renderLine={line => <p key={line.key}>{line.label}</p>} />);
    expect(container.querySelector('details')?.open).toBe(false);
    expect(screen.getByText(/Voir les mois/)).toBeTruthy();
    expect(screen.getByText('Septembre payé')).toBeTruthy();
    expect(screen.getByText('Octobre à payer')).toBeTruthy();
    expect(screen.getByText(/Reste : 4/)).toBeTruthy();
    fireEvent.click(container.querySelector('summary')!);
  });
  it('preserves legacy payloads without inventing group totals', () => {
    const { container } = render(<AccountFeeGroups lines={[{ key: 'legacy' }]} renderLine={line => <p key={line.key}>Frais historique</p>} />);
    expect(screen.getByText('Frais historique')).toBeTruthy();
    expect(container.querySelector('details')).toBeNull();
  });
});
