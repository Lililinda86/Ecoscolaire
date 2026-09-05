/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudentAccountCollection from '../../src/components/StudentAccountCollection';
import type { School, Student } from '../../src/types';

const mocks = vi.hoisted(() => ({ getAccount: vi.fn(), recordCollection: vi.fn() }));

vi.mock('../../src/db/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_functions, name: string) =>
    name === 'getStudentFinancialAccount' ? mocks.getAccount : mocks.recordCollection),
}));
vi.mock('jspdf', () => ({ jsPDF: vi.fn() }));

const school = { id: 'school-1', name: 'École Test', academicYear: '2026-2027' } as School;
const students = [{ id: 'student-1', schoolId: 'school-1', classId: 'class-1',
  name: 'Élève au nom particulièrement long pour vérifier la robustesse de la mise en page',
  matricule: 'MAT-001' }] as Student[];

const line = (key: string, type: 'tuition' | 'transport' | 'uniforms', label: string, remaining: number) => ({
  key, type, label, installment: type === 'tuition' ? 'T1' : null, period: null, feeId: null,
  grossExpectedAmount: remaining, discountAmount: 0, netExpectedAmount: remaining,
  previousPaid: 0, remainingBalance: remaining, status: 'UNPAID', benefits: [],
  moratoriumStatus: 'NONE', effectiveDueDate: null, overdue: false,
  dueStatus: 'DUE', selectable: true,
});

const account = {
  student: { id: 'student-1', name: students[0].name, matricule: 'MAT-001', classId: 'class-1', className: 'CP' },
  school: { id: 'school-1', name: 'École Test' }, academicYear: '2026-2027',
  totals: { totalBilled: 77_000, totalBenefits: 0, totalPaid: 0, totalRemaining: 77_000, overdueAmount: 0 },
  lines: [line('tuition:T1', 'tuition', 'Scolarité T1', 50_000),
    line('transport', 'transport', 'Transport', 12_000),
    line('uniforms', 'uniforms', 'Tenue scolaire', 15_000)],
};

describe('StudentAccountCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccount.mockResolvedValue({ data: account });
    mocks.recordCollection.mockResolvedValue({ data: {
      collectionId: 'collection-1', paymentId: 'collection-1', receiptId: 'collection-1',
      receiptNumber: 'REC-2026-0042', amount: 39_000, remainingBalance: 38_000,
      idempotentReplay: false,
      lineItems: [
        { key: 'tuition:T1', label: 'Scolarité T1', amount: 20_000, remainingBalance: 30_000 },
        { key: 'transport', label: 'Transport', amount: 4_000, remainingBalance: 8_000 },
        { key: 'uniforms', label: 'Tenue scolaire', amount: 15_000, remainingBalance: 0 },
      ],
    } });
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([360, 768, 1440])('keeps the account controls accessible at %ipx', async width => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
    render(<StudentAccountCollection students={students} school={school} initialStudentId="student-1"
      onClose={vi.fn()} />);

    expect(await screen.findByText('Frais applicables')).toBeTruthy();
    expect(screen.getByLabelText('Montant reçu pour Scolarité T1')).toBeTruthy();
    expect(screen.getByLabelText('Montant reçu pour Transport')).toBeTruthy();
    expect(screen.getByRole('button', { name: /ENCAISSER/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(students[0].name)).toBeTruthy();
  });

  it('submits only selected targets and integer amounts, then renders one global receipt', async () => {
    render(<StudentAccountCollection students={students} school={school} initialStudentId="student-1"
      onClose={vi.fn()} />);
    await screen.findByText('Frais applicables');

    fireEvent.change(screen.getByLabelText('Montant reçu pour Scolarité T1'), { target: { value: '20000' } });
    fireEvent.change(screen.getByLabelText('Montant reçu pour Transport'), { target: { value: '4000' } });
    fireEvent.change(screen.getByLabelText('Montant reçu pour Tenue scolaire'), { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: /ENCAISSER 39/ }));

    await waitFor(() => expect(mocks.recordCollection).toHaveBeenCalledTimes(1));
    expect(mocks.recordCollection.mock.calls[0][0]).toEqual({
      requestId: '11111111-1111-4111-8111-111111111111', schoolId: 'school-1',
      studentId: 'student-1', academicYear: '2026-2027', allocations: [
        { type: 'tuition', installment: 'T1', period: null, feeId: null, amount: 20_000 },
        { type: 'transport', installment: null, period: null, feeId: null, amount: 4_000 },
        { type: 'uniforms', installment: null, period: null, feeId: null, amount: 15_000 },
      ],
    });
    expect(await screen.findByText('REC-2026-0042')).toBeTruthy();
    expect(screen.getAllByText('Scolarité T1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Transport').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tenue scolaire').length).toBeGreaterThan(0);
    expect(screen.getByText(/Total reçu — Espèces/)).toBeTruthy();
  });
});
