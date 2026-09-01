/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReceiptHistory from '../../src/components/ReceiptHistory';
import type { ReceiptLike, Student } from '../../src/types';

vi.mock('../../src/context/AppContext', () => ({
  useAppContext: () => ({ db: { payments: [] } }),
}));

vi.mock('html2canvas', () => ({ default: vi.fn() }));

const receipts = [
  {
    id: 'receipt-transport-credit',
    receiptNumber: 'REC-2026-0013',
    paymentId: 'payment-transport-credit',
    studentId: 'student-1',
    paymentType: 'transport',
    type: 'transport',
    amount: 10_000,
    date: '2026-08-29',
    allocationSummary: [
      { kind: 'INSTALLMENT', period: '2025-12', amount: 4_000 },
      { kind: 'CREDIT', period: null, amount: 2_000 },
    ],
    transportCredit: 2_000,
    transportContext: {
      zonePk: 28, neighborhood: 'Quartier A', pickupPoint: 'Point A',
      feePolicyId: 'ITALO_PK_2026', monthlyGrossAmount: 4_000,
      transportState: 'BILLABLE', billingPeriods: ['2025-12'],
    },
  },
  {
    id: 'receipt-second',
    receiptNumber: 'REC-2026-0012',
    paymentId: 'payment-second',
    studentId: 'student-2',
    paymentType: 'transport',
    type: 'transport',
    amount: 4_000,
    date: '2026-08-28',
  },
] as ReceiptLike[];

const students = [
  { id: 'student-1', name: 'Élève Transport' },
  { id: 'student-2', name: 'Autre Élève' },
] as Student[];

const renderHistory = () => render(
  <ReceiptHistory receipts={receipts} students={students} school={null} classes={[]} />,
);

describe('ReceiptHistory responsive detail controls', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 360 });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([360, 768, 1440])('keeps the exact receipt row and its actions accessible at %ipx', (width) => {
    window.innerWidth = width;
    renderHistory();

    const row = screen.getByTestId('receipt-row-receipt-transport-credit');
    expect(within(row).getByText('REC-2026-0013')).not.toBeNull();
    expect(within(row).getByRole('button', { name: 'Télécharger le PDF' })).not.toBeNull();
    expect(within(row).getByRole('button', { name: 'Imprimer' })).not.toBeNull();

    const toggle = within(row).getByTestId('receipt-detail-toggle-receipt-transport-credit');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect((toggle as HTMLElement).style.minWidth).toBe('44px');
    expect((toggle as HTMLElement).style.minHeight).toBe('44px');
  });

  it('opens and closes only the detail belonging to the scoped receipt row', async () => {
    const user = userEvent.setup();
    renderHistory();

    const targetRow = screen.getByTestId('receipt-row-receipt-transport-credit');
    const otherRow = screen.getByTestId('receipt-row-receipt-second');
    const targetToggle = within(targetRow).getByTestId('receipt-detail-toggle-receipt-transport-credit');
    const otherToggle = within(otherRow).getByTestId('receipt-detail-toggle-receipt-second');

    await user.click(targetToggle);

    const detail = screen.getByTestId('receipt-detail-receipt-transport-credit');
    expect(targetToggle.getAttribute('aria-expanded')).toBe('true');
    expect(otherToggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(detail).getByText('Période 2025-12')).not.toBeNull();
    expect(within(detail).getByText('Crédit Transport')).not.toBeNull();
    expect(within(detail).getByText(/Crédit disponible :/)).not.toBeNull();
    expect(within(detail).getByTestId('transport-receipt-context-receipt-transport-credit')).not.toBeNull();
    expect(within(detail).getByText(/PK28/)).not.toBeNull();
    expect(within(detail).getByText(/Quartier A/)).not.toBeNull();
    expect(screen.queryByTestId('receipt-detail-receipt-second')).toBeNull();

    await user.click(targetToggle);

    expect(targetToggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('receipt-detail-receipt-transport-credit')).toBeNull();
    expect(otherToggle.getAttribute('aria-expanded')).toBe('false');
  });
});
