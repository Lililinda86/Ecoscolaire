/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const state = vi.hoisted(() => ({ schoolId: 'school-a', load: vi.fn() }));
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({ currentSchool: { id: state.schoolId, activeAcademicYearId: state.schoolId + '-year' }, currentUser: { role: 'secretary' }, db: { academicYears: [{ id: state.schoolId + '-year', schoolId: state.schoolId, status: 'active' }], classes: [] } }) }));
vi.mock('../../src/features/pedagogy/hooks/usePedagogyWorkspace', () => ({ usePedagogyWorkspace: () => ({ plans: [], weeks: [{ id: state.schoolId + '-week', weekStartDate: '2000-01-01', weekEndDate: '2100-01-01', weekNumber: 1 }], error: '', loading: false }) }));
vi.mock('../../src/features/pedagogy/hooks/useLessonPreparations', () => ({ useLessonPreparations: () => ({ preparations: [], loading: false, error: '' }) }));
vi.mock('../../src/features/pedagogy/services/pedagogyService', () => ({ loadWeeklyAssessments: state.load }));
import PedagogyDashboard from '../../src/features/pedagogy/pages/PedagogyDashboard';
afterEach(() => { cleanup(); state.schoolId = 'school-a'; state.load.mockReset(); });
it('hides previous-scope counts immediately and ignores late school responses', async () => {
  let resolveOld!: (value: unknown[]) => void;
  state.load.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce([]);
  const view = render(<MemoryRouter><PedagogyDashboard /></MemoryRouter>);
  await waitFor(() => expect(state.load).toHaveBeenCalledTimes(1));
  state.schoolId = 'school-b';
  view.rerender(<MemoryRouter><PedagogyDashboard /></MemoryRouter>);
  expect(screen.getByText('prêtes à imprimer').parentElement?.textContent).toContain('—');
  await waitFor(() => expect(state.load).toHaveBeenCalledTimes(2));
  await act(async () => { resolveOld([{ schoolId: 'school-a', status: 'ready_to_print' }]); });
  await waitFor(() => expect(screen.getByText('prêtes à imprimer').parentElement?.textContent).toBe('0prêtes à imprimer'));
});
it('reports failed reads as unavailable instead of a verified zero', async () => {
  state.load.mockRejectedValueOnce(new Error('Synthetic read failure'));
  render(<MemoryRouter><PedagogyDashboard /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Synthetic read failure'));
  expect(screen.getByText('prêtes à imprimer').parentElement?.textContent).toContain('—');
});
