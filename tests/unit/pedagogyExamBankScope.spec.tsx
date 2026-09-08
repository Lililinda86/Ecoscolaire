/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const state = vi.hoisted(() => ({ schoolId: 'a', bank: vi.fn(), items: vi.fn() }));
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({
  currentSchool: { id: state.schoolId, name: 'Synthetic school', activeAcademicYearId: state.schoolId + '-year' }, currentUser: { role: 'secretary' },
  db: { academicYears: [{ id: state.schoolId + '-year', schoolId: state.schoolId, name: 'Synthetic year' }],
    classes: [{ id: state.schoolId + '-class', schoolId: state.schoolId, name: 'CE1', type: 'francophone', cycle: 'primary' }] },
}) }));
vi.mock('../../src/features/pedagogy/services/examBank', () => ({ loadInternalExamBank: state.bank }));
vi.mock('../../src/features/pedagogy/services/pedagogyService', () => ({ loadAssessmentItems: state.items }));
import PedagogyExamBank from '../../src/features/pedagogy/pages/PedagogyExamBank';
const assessment = { id: 'assessment-a', schoolId: 'a', academicYearId: 'a-year', classId: 'a-class', title: 'Synthetic addition', className: 'CE1', fridayDate: '2026-09-04', generationVersion: 1, contentRevision: 0, coveredSubjects: [{ id: 'math', name: 'Maths' }], status: 'ready_to_print', totalPoints: 20, durationMinutes: 10, weekStartDate: '2026-08-31' };
const item = { id: 'item', schoolId: 'a', weeklyAssessmentId: assessment.id, generationVersion: 1, order: 1, questionText: 'Three plus four?', expectedAnswer: 'Synthetic answer seven', correctionGuide: 'Synthetic guide', points: 20 };
afterEach(() => { cleanup(); state.schoolId = 'a'; state.bank.mockReset(); state.items.mockReset(); });
it('separates the student sheet from corrections and removes it on school change', async () => {
  state.bank.mockResolvedValueOnce([assessment]).mockResolvedValueOnce([]);
  state.items.mockResolvedValue([item]);
  const view = render(<MemoryRouter><PedagogyExamBank /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Consulter' }));
  await screen.findByText(/Three plus four/);
  expect(screen.queryByText('Synthetic answer seven')).toBeNull();
  fireEvent.change(screen.getByLabelText('Exemplaire de la banque'), { target: { value: 'correction' } });
  expect(screen.getByText('Synthetic answer seven')).toBeTruthy();
  expect(screen.getByText('BROUILLON — À VALIDER PAR L’ENSEIGNANT')).toBeTruthy();
  state.schoolId = 'b';
  view.rerender(<MemoryRouter><PedagogyExamBank /></MemoryRouter>);
  expect(screen.queryByText('Synthetic answer seven')).toBeNull();
  await waitFor(() => expect(state.bank).toHaveBeenLastCalledWith('b', 'b-year', 'b-class'));
});
it('ignores a late old-school list and reports unavailability instead of empty success', async () => {
  let finish!: (value: unknown[]) => void;
  state.bank.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockRejectedValueOnce(new Error('Synthetic bank unavailable'));
  const view = render(<MemoryRouter><PedagogyExamBank /></MemoryRouter>);
  await waitFor(() => expect(state.bank).toHaveBeenCalledTimes(1));
  state.schoolId = 'b'; view.rerender(<MemoryRouter><PedagogyExamBank /></MemoryRouter>);
  await screen.findByRole('alert');
  await act(async () => { finish([assessment]); });
  expect(screen.queryByText(/Synthetic addition/)).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('Synthetic bank unavailable');
});
