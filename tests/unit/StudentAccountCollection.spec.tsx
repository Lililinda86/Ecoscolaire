/** @vitest-environment jsdom */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudentAccountCollection from '../../src/components/StudentAccountCollection';
import type { School, Student } from '../../src/types';

const collectionCss = readFileSync(resolve(process.cwd(), 'src/components/StudentAccountCollection.css'), 'utf8');

const mocks = vi.hoisted(() => ({ getAccount: vi.fn(), recordCollection: vi.fn() }));

vi.mock('../../src/db/firebase', () => ({ db: {}, functions: {} }));
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
  originalDueDate: '2026-10-05', moratoriumStatus: 'NONE', effectiveDueDate: '2026-10-05', nextDueDate: '2026-10-05', overdue: false,
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
      classNamesById={{ 'class-1': 'CP' }} onClose={vi.fn()} />);

    expect(await screen.findByText('Frais à régler')).toBeTruthy();
    expect(screen.getByLabelText('Montant reçu pour Scolarité T1')).toBeTruthy();
    expect(screen.getByLabelText('Montant reçu pour Transport')).toBeTruthy();
    expect(screen.getByRole('button', { name: /ENCAISSER/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(students[0].name)).toBeTruthy();
  });

  it('uses one desktop scroll container with a two-panel workspace and a sticky payment panel', () => {
    expect(collectionCss).toMatch(/\.account-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+310px/);
    expect(collectionCss).toMatch(/\.collection-basket\s*\{[^}]*position:\s*sticky[^}]*align-self:\s*start/);
    const obligationListRule = collectionCss.match(/\.obligation-list\s*\{([^}]*)\}/)?.[1] || '';
    expect(obligationListRule).not.toMatch(/overflow:\s*(auto|scroll)/);
    expect(obligationListRule).not.toMatch(/max-height/);
    expect(collectionCss).toMatch(/@media\s*\(max-width:\s*900px\)[\s\S]*\.account-workspace\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(collectionCss).toMatch(/@media\s*\(max-width:\s*900px\)[\s\S]*\.collection-basket\s*\{[^}]*position:\s*static/);
  });

  it('submits only selected targets and integer amounts, then renders one global receipt', async () => {
    render(<StudentAccountCollection students={students} school={school} initialStudentId="student-1"
      classNamesById={{ 'class-1': 'CP' }} onClose={vi.fn()} />);
    await screen.findByText('Frais à régler');

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

  it('shows the complete relevant student list immediately, sorted and formatted without cross-school entries', () => {
    const schoolWithActiveYear = { ...school, activeAcademicYearId: 'year-active' } as School;
    const list = [
      { id: 'z', schoolId: 'school-1', academicYearId: 'year-active', name: 'Zibi Isabelle', matricule: 'MAT-002', classId: 'class-1' },
      { id: 'a', schoolId: 'school-1', academicYearId: 'year-active', name: 'Aaron Issende', matricule: 'MAT-001', classId: 'class-2' },
      { id: 'other', schoolId: 'school-2', academicYearId: 'year-active', name: 'Autre École', matricule: 'MAT-X', classId: 'class-1' },
      { id: 'inactive', schoolId: 'school-1', academicYearId: 'year-active', schoolingStatus: 'inactive', name: 'Ancien Élève', matricule: 'MAT-I', classId: 'class-1' },
      { id: 'old-year', schoolId: 'school-1', academicYearId: 'year-old', name: 'Ancienne Année', matricule: 'MAT-Y', classId: 'class-1' },
    ] as Student[];

    render(<StudentAccountCollection students={list} school={schoolWithActiveYear}
      classNamesById={{ 'class-1': 'CP', 'class-2': 'CM2' }} onClose={vi.fn()} />);

    const select = screen.getByLabelText('Élève') as HTMLSelectElement;
    expect(Array.from(select.options).map(option => option.textContent)).toEqual([
      '-- Choisir un élève --',
      'Aaron Issende — CM2 — MAT-001',
      'Zibi Isabelle — CP — MAT-002',
    ]);
  });

  it('fills the exact remaining balance with Solder and updates Paiement en cours immediately', async () => {
    render(<StudentAccountCollection students={students} school={school} initialStudentId="student-1"
      classNamesById={{ 'class-1': 'CP' }} onClose={vi.fn()} />);
    await screen.findByText('Frais à régler');

    fireEvent.click(screen.getByRole('button', { name: /Solder 50/ }));

    expect((screen.getByLabelText('Montant reçu pour Scolarité T1') as HTMLInputElement).value).toBe('50000');
    expect(screen.getByText('Paiement en cours')).toBeTruthy();
    expect(screen.getByRole('button', { name: /ENCAISSER 50/ }).hasAttribute('disabled')).toBe(false);
  });

  it('always explains approved benefits and active moratoriums from the server account', async () => {
    mocks.getAccount.mockResolvedValueOnce({ data: {
      ...account,
      totals: { ...account.totals, totalBenefits: 10_000, totalRemaining: 67_000, overdueAmount: 40_000 },
      lines: [{
        ...account.lines[0], grossExpectedAmount: 50_000, discountAmount: 10_000,
        netExpectedAmount: 40_000, remainingBalance: 40_000, moratoriumStatus: 'ACTIVE',
        originalDueDate: '2026-10-05', effectiveDueDate: '2026-11-05', nextDueDate: '2026-11-05',
        benefits: [{ benefitId: 'benefit-1', benefitType: 'scholarship', discountAmount: 10_000 }],
      }],
    } });

    render(<StudentAccountCollection students={students} school={school} initialStudentId="student-1"
      classNamesById={{ 'class-1': 'CP' }} onClose={vi.fn()} />);

    expect(await screen.findByText('Bourse')).toBeTruthy();
    expect(screen.getByText(/Nouvelle échéance : 05\/11\/2026/)).toBeTruthy();
    expect(screen.getByText('Échéance initiale')).toBeTruthy();
    expect(screen.getByText('Échéance effective')).toBeTruthy();
    expect(screen.getByText('Prochaine échéance')).toBeTruthy();
    expect(screen.getByText('En retard')).toBeTruthy();
    expect(screen.getAllByText(/40.000 FCFA/).length).toBeGreaterThan(0);
    expect(screen.getByText('MORATOIRE')).toBeTruthy();
    const statusGroup = screen.getByText('MORATOIRE').closest('.obligation-status-group');
    expect(statusGroup?.textContent).toContain('Nouvelle échéance : 05/11/2026');
    expect(statusGroup?.textContent).not.toContain('05/10/2026');
    expect(screen.getByText('Avantage')).toBeTruthy();
  });

  it('places the server-provided applicable due date next to every payable status', async () => {
    render(<StudentAccountCollection students={students} school={school} initialStudentId="student-1"
      classNamesById={{ 'class-1': 'CP' }} onClose={vi.fn()} />);
    await screen.findByText('Frais à régler');

    const statusBadges = screen.getAllByText('À PAYER');
    expect(statusBadges).toHaveLength(account.lines.length);
    for (const badge of statusBadges) {
      expect(badge.closest('.obligation-status-group')?.textContent).toContain('Échéance : 05/10/2026');
    }
  });

  it('clears every allocation and stale account detail when the selected student changes', async () => {
    const secondStudent = { id: 'student-2', schoolId: 'school-1', classId: 'class-2', name: 'Deuxième Élève', matricule: 'MAT-002' } as Student;
    const secondAccount = {
      ...account,
      student: { id: 'student-2', name: secondStudent.name, matricule: 'MAT-002', classId: 'class-2', className: 'CM2' },
      totals: { totalBilled: 25_000, totalBenefits: 0, totalPaid: 0, totalRemaining: 25_000, overdueAmount: 0 },
      lines: [line('tuition:T2', 'tuition', 'Scolarité T2', 25_000)],
    };
    mocks.getAccount.mockImplementation(({ studentId }: { studentId: string }) => Promise.resolve({
      data: studentId === 'student-2' ? secondAccount : account,
    }));

    render(<StudentAccountCollection students={[...students, secondStudent]} school={school} initialStudentId="student-1"
      classNamesById={{ 'class-1': 'CP', 'class-2': 'CM2' }} onClose={vi.fn()} />);
    await screen.findByText('Frais à régler');
    fireEvent.change(screen.getByLabelText('Montant reçu pour Scolarité T1'), { target: { value: '20000' } });

    fireEvent.change(screen.getByLabelText('Élève'), { target: { value: 'student-2' } });

    const nextInput = await screen.findByLabelText('Montant reçu pour Scolarité T2');
    expect((nextInput as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText('Montant reçu pour Scolarité T1')).toBeNull();
    expect(screen.getByRole('button', { name: /ENCAISSER 0/ }).hasAttribute('disabled')).toBe(true);
  });

  it('blocks collection after an account load error and offers an explicit retry', async () => {
    mocks.getAccount.mockRejectedValueOnce(new Error('indisponible'));
    render(<StudentAccountCollection students={students} school={school} initialStudentId="student-1"
      classNamesById={{ 'class-1': 'CP' }} onClose={vi.fn()} />);

    expect(await screen.findByText(/Impossible de charger la situation financière/)).toBeTruthy();
    expect(screen.queryByTestId('cash-payment-submit')).toBeNull();

    mocks.getAccount.mockResolvedValueOnce({ data: account });
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Frais à régler')).toBeTruthy();
  });
  it('shows and opens the advantage drawer for a secretary', async () => {
    render(<StudentAccountCollection students={students} school={school} initialStudentId="student-1"
      currentRole="secretary" classNamesById={{ 'class-1': 'CP' }} onClose={vi.fn()} />);
    await screen.findByText('Frais à régler');

    fireEvent.click(screen.getByRole('button', { name: /Ajouter un avantage/ }));
    expect(screen.getByRole('dialog', { name: 'Ajouter un avantage ou aménagement' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Soumettre pour approbation' })).toBeTruthy();
  });

  it('does not expose advantage creation to an accountant', async () => {
    render(<StudentAccountCollection students={students} school={school} initialStudentId="student-1"
      currentRole="accountant" classNamesById={{ 'class-1': 'CP' }} onClose={vi.fn()} />);
    await screen.findByText('Frais à régler');

    expect(screen.queryByRole('button', { name: /Ajouter un avantage/ })).toBeNull();
  });

});
