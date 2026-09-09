/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const state = vi.hoisted(() => ({ schoolId: 'a', role: 'secretary', adopt: vi.fn(), refresh: vi.fn() }));
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({
  currentSchool: { id: state.schoolId, activeAcademicYearId: state.schoolId + '-year' }, currentUser: { role: state.role },
  db: { academicYears: [{ id: 'a-year', schoolId: 'a', name: 'A year', status: 'active' }, { id: 'b-year', schoolId: 'b', name: 'B year', status: 'active' }],
    classes: [{ id: 'a-class', schoolId: 'a', catalogLevelId: 'primary-a' }, { id: 'b-class', schoolId: 'b', catalogLevelId: 'primary-b' }] },
}) }));
vi.mock('../../src/features/pedagogy/services/pedagogyService', () => ({ adoptCurriculumProgram: state.adopt }));
vi.mock('../../src/features/pedagogy/services/curriculumUnits', () => ({ loadPublishedCurriculumUnits: async () => [] }));
vi.mock('../../src/features/pedagogy/hooks/usePedagogyWorkspace', () => ({ usePedagogyWorkspace: () => ({
  programs: [{ id: 'program', title: 'Synthetic programme', version: 'v1', sourceType: 'mock' }], adoptions: [], error: '', loading: false, refresh: state.refresh,
}) }));
import PedagogyProgram from '../../src/features/pedagogy/pages/PedagogyProgram';
afterEach(() => { cleanup(); state.schoolId = 'a'; state.role = 'secretary'; state.adopt.mockReset(); state.refresh.mockReset(); });
const fill = () => {
  fireEvent.change(screen.getByLabelText('Niveau'), { target: { value: 'primary-a' } });
  fireEvent.change(screen.getByLabelText('Programme'), { target: { value: 'program' } });
  fireEvent.change(screen.getByLabelText('Auteur de la décision reçue'), { target: { value: 'Synthetic reviewer' } });
  fireEvent.change(screen.getByLabelText('Date de la décision'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText('Référence ou note de transmission'), { target: { value: 'Synthetic decision only' } });
};
it('requires an explicit received decision and sends the consulted versions', async () => {
  state.adopt.mockResolvedValue({ revision: 1 });
  render(<MemoryRouter><PedagogyProgram /></MemoryRouter>); fill();
  const button = screen.getByRole('button', { name: 'Enregistrer la décision d’adoption' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(button);
  await waitFor(() => expect(state.adopt).toHaveBeenCalledTimes(1));
  expect(state.adopt).toHaveBeenCalledWith(expect.objectContaining({ schoolId: 'a', academicYearId: 'a-year', expectedRevision: 0, expectedProgramVersion: 'v1', declarationReceived: true }));
  await screen.findByText(/Décision reçue enregistrée/);
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
});
it('clears the receipt and restricts levels on school changes', () => {
  const view = render(<MemoryRouter><PedagogyProgram /></MemoryRouter>); fill(); fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.queryByRole('option', { name: 'primary-b' })).toBeNull();
  state.schoolId = 'b'; view.rerender(<MemoryRouter><PedagogyProgram /></MemoryRouter>);
  expect(screen.queryByRole('option', { name: 'primary-a' })).toBeNull();
  expect((screen.getByLabelText('Auteur de la décision reçue') as HTMLInputElement).value).toBe('');
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  expect(state.adopt).not.toHaveBeenCalled();
});
it('locks an uncertain submission until a reload checks the actual state', async () => {
  state.adopt.mockRejectedValue(new Error('Synthetic network uncertainty'));
  render(<MemoryRouter><PedagogyProgram /></MemoryRouter>); fill(); fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la décision d’adoption' }));
  await screen.findByRole('button', { name: 'Recharger et vérifier l’état' });
  expect(screen.getByLabelText('Niveau').closest('fieldset')?.disabled).toBe(true);
  expect(state.adopt).toHaveBeenCalledTimes(1);
});
