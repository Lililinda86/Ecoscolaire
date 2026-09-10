/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SchoolFeeCatalog } from '../../src/components/Settings/SchoolFeeCatalog';
const state = vi.hoisted(() => ({ fees: [] as Record<string, unknown>[], failure: '', omit: false, saves: 0 }));
vi.mock('../../src/db/firebase', () => ({ functions: {} }));
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({ currentUser: { role: 'director' }, db: {
  school: { id: 'school', academicYear: '2026-2027', activeAcademicYearId: 'year' },
  classes: [{ id: 'cp', schoolId: 'school', name: 'CP', cycle: 'primary', academicYearId: 'year' }],
  students: [{ id: 's', schoolId: 'school', name: 'Élève test', classId: 'cp', academicYearId: 'year' }]
} }) }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_: unknown, name: string) => async (payload: {feeId: string; fee: Record<string, unknown>}) => {
  if (name === 'getSchoolFeeCatalog') return { data: { fees: state.fees } };
  state.saves++;
  if (state.failure) throw new Error(state.failure);
  if (!state.omit) state.fees = [{ ...payload.fee, id: payload.feeId, schemaVersion: 2, active: true }];
  return { data: { feeId: payload.feeId } };
} }));
afterEach(() => { cleanup(); state.fees = []; state.failure = ''; state.omit = false; state.saves = 0; });
async function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter un frais', exact: true }));
  fireEvent.change(screen.getByLabelText('Libellé précis du frais'), { target: { value: 'Test tenue' } });
  fireEvent.change(screen.getByLabelText('Montant (FCFA)'), { target: { value: '5000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier avant publication' }));
  expect(state.saves).toBe(0);
  expect(screen.getByText(/Brouillon non enregistré/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Publier le frais', exact: true }));
}
it('confirms the exact server document and reloads it after a fresh mount', async () => {
  const view = render(<SchoolFeeCatalog />); await submit();
  await screen.findByText('Frais publié avec succès');
  expect(state.fees[0]).toMatchObject({ label: 'Test tenue', amount: 5000, mandatory: true, academicYear: '2026-2027', category: 'uniform', classIds: [], studentIds: [], cycles: [] });
  view.unmount(); render(<SchoolFeeCatalog />);
  const list = within(screen.getByRole('heading', { name: 'Tenues', exact: true }).closest('section')!);
  expect(await list.findByText('Test tenue')).toBeTruthy(); expect(state.saves).toBe(1);
});
it.each(['permission-denied : publication refusée', 'Serveur indisponible'])('retains the form and shows a server refusal: %s', async failure => {
  state.failure = failure; render(<SchoolFeeCatalog />); await submit();
  await vi.waitFor(() => expect(screen.getAllByRole('alert')[0].textContent).toContain(failure));
  expect((screen.getByLabelText('Libellé précis du frais') as HTMLInputElement).value).toBe('Test tenue');
  expect(screen.queryByText('Frais publié avec succès')).toBeNull(); expect(state.fees).toHaveLength(0);
});
it('never claims success when the readback does not contain the submitted fee', async () => {
  state.omit = true; render(<SchoolFeeCatalog />); await submit();
  await vi.waitFor(() => expect(screen.getAllByRole('alert')[0].textContent).toContain('Publication non confirmée'));
  expect(screen.queryByText('Frais publié avec succès')).toBeNull();
  expect((screen.getByLabelText('Montant (FCFA)') as HTMLInputElement).value).toBe('5000');
});
