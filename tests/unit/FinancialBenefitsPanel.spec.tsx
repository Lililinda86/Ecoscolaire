/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import FinancialBenefitsPanel from '../../src/components/FinancialBenefitsPanel';

vi.mock('../../src/db/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => name),
  where: vi.fn((...args) => args),
  query: vi.fn((...args) => args),
  getDocs: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const callable = vi.fn();
const emptySnapshot = { docs: [] };

describe('FinancialBenefitsPanel permissions and scopes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDocs).mockResolvedValue(emptySnapshot as never);
    callable.mockResolvedValue({ data: { benefitId: 'benefit-1', status: 'draft' } });
    vi.mocked(httpsCallable).mockReturnValue(callable as never);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not expose creation or approval controls to a secretary', async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [{
        id: 'approved-1',
        data: () => ({
          schoolId: 'school-1', studentId: 'student-1', academicYear: '2026-2027',
          paymentType: 'TUITION', installment: 'T1', benefitType: 'SCHOLARSHIP',
          mode: 'FIXED_AMOUNT', value: 10000, stackable: true, status: 'approved'
        })
      }]
    } as never);

    render(<FinancialBenefitsPanel
      schoolId="school-1" studentId="student-1" academicYear="2026-2027"
      paymentType="tuition" installment="T1" currentRole="secretary" onChanged={vi.fn()}
    />);

    expect(await screen.findByText('Bourse')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nouvel avantage' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approuver' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
  });

  it('lets an owner create an all-tuition benefit without client-side fee mutation', async () => {
    render(<FinancialBenefitsPanel
      schoolId="school-1" studentId="student-1" academicYear="2026-2027"
      paymentType="tuition" installment="T1" currentRole="owner" onChanged={vi.fn()}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Nouvel avantage' }));
    fireEvent.change(screen.getByLabelText('Périmètre'), { target: { value: 'ALL_TUITION' } });
    fireEvent.change(screen.getByLabelText('Montant par échéance FCFA'), { target: { value: '10000' } });
    fireEvent.change(screen.getByLabelText('Motif'), { target: { value: 'Bourse annuelle fictive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }));

    await waitFor(() => expect(callable).toHaveBeenCalledTimes(1));
    expect(callable.mock.calls[0][0]).toMatchObject({
      schoolId: 'school-1', studentId: 'student-1', academicYear: '2026-2027',
      paymentType: 'TUITION', installment: 'ALL_TUITION', value: 10000
    });
    expect(callable.mock.calls[0][0].maximumUses).toBeUndefined();
  });

  it('maps the school-year transport scope to September through June', async () => {
    render(<FinancialBenefitsPanel
      schoolId="school-1" studentId="student-1" academicYear="2026-2027"
      paymentType="transport" period="2026-09" currentRole="director" onChanged={vi.fn()}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Nouvel avantage' }));
    fireEvent.change(screen.getByLabelText('Périmètre'), { target: { value: 'TRANSPORT_YEAR' } });
    fireEvent.change(screen.getByLabelText('Montant par échéance FCFA'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Motif'), { target: { value: 'Aide transport annuelle fictive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }));

    await waitFor(() => expect(callable).toHaveBeenCalledTimes(1));
    expect(callable.mock.calls[0][0]).toMatchObject({
      paymentType: 'TRANSPORT', transportStartPeriod: '2026-09', transportEndPeriod: '2027-06'
    });
  });
});
