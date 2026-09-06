/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PedagogyObservations from '../../src/features/pedagogy/pages/PedagogyObservations';

const fake = vi.hoisted(() => ({ call: vi.fn(), getDocs: vi.fn() }));
vi.mock('../../src/db/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => fake.call }));
vi.mock('firebase/firestore', () => ({ getDocs: fake.getDocs, collection: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(), orderBy: vi.fn(), documentId: vi.fn(), startAfter: vi.fn() }));
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({
  currentUser: { role: 'secretary' }, currentSchool: { id: 'school', activeAcademicYearId: 'year' },
  db: { academicYears: [{ id: 'year', schoolId: 'school' }], classes: [{ id: 'class', schoolId: 'school', name: 'Synthetic class' }], staff: [{ id: 'teacher', schoolId: 'school', name: 'Synthetic teacher', role: 'teacher' }] },
}) }));
vi.mock('../../src/features/pedagogy/hooks/usePedagogyWorkspace', () => ({ usePedagogyWorkspace: () => ({ weeks: [{ id: 'week', weekNumber: 1, weekStartDate: '2026-09-07' }] }) }));
vi.mock('../../src/features/pedagogy/hooks/useLessonPreparations', () => ({ useLessonPreparations: () => ({ preparations: [{
  id: 'prep', status: 'validated', teachingConfirmation: { status: 'taught' }, subjectName: 'Synthetic subject', lessonTitle: 'Synthetic lesson', reviewData: { objective: 'Exact objective' },
}] }) }));
beforeEach(() => {
  fake.getDocs.mockResolvedValue({ docs: [{ id: 'pupil', data: () => ({ name: 'Synthetic pupil' }) }], size: 1 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); fake.call.mockReset(); });
async function fill() {
  render(<MemoryRouter><PedagogyObservations /></MemoryRouter>);
  await screen.findByLabelText('Synthetic pupil');
  fireEvent.change(screen.getByLabelText('Activité enseignée'), { target: { value: 'prep' } });
  fireEvent.change(screen.getByLabelText('Objectif observable, extrait exact du contenu confirmé'), { target: { value: 'Exact objective' } });
  fireEvent.change(screen.getByLabelText('Enseignant déclarant'), { target: { value: 'teacher' } });
  fireEvent.click(screen.getByLabelText('Synthetic pupil'));
  fireEvent.change(screen.getByLabelText('Contexte pour Synthetic pupil'), { target: { value: 'Synthetic received context' } });
  fireEvent.click(screen.getByLabelText('Ces observations m’ont été transmises par l’enseignant sélectionné.'));
}
it('locks scope and fields after uncertain response and retries the exact captured payload', async () => {
  fake.call.mockRejectedValueOnce(Object.assign(new Error('Synthetic unavailable'), { code: 'functions/unavailable' })).mockResolvedValueOnce({ data: {} });
  await fill();
  expect((screen.getByLabelText('Classe') as HTMLSelectElement).disabled).toBe(true);
  expect((screen.getByLabelText('Activité enseignée') as HTMLSelectElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les observations' }));
  const retry = await screen.findByRole('button', { name: 'Reprendre la même demande' });
  expect(screen.getByLabelText('Contexte pour Synthetic pupil').closest('fieldset')?.disabled).toBe(true);
  fireEvent.click(retry);
  await waitFor(() => expect(fake.call).toHaveBeenCalledTimes(2));
  expect(fake.call.mock.calls[1][0]).toEqual(fake.call.mock.calls[0][0]);
  await waitFor(() => expect((screen.getByLabelText('Classe') as HTMLSelectElement).disabled).toBe(false));
});
it('keeps editable input after a definite rejection and uses a new request for a corrected submission', async () => {
  fake.call.mockRejectedValueOnce(Object.assign(new Error('Synthetic invalid input'), { code: 'functions/invalid-argument' })).mockResolvedValueOnce({ data: {} });
  await fill();
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les observations' }));
  await screen.findByText('Synthetic invalid input');
  expect(screen.queryByRole('button', { name: 'Reprendre la même demande' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Contexte pour Synthetic pupil'), { target: { value: 'Corrected synthetic context' } });
  fireEvent.click(screen.getByLabelText('Ces observations m’ont été transmises par l’enseignant sélectionné.'));
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les observations' }));
  await waitFor(() => expect(fake.call).toHaveBeenCalledTimes(2));
  expect(fake.call.mock.calls[1][0].requestId).not.toBe(fake.call.mock.calls[0][0].requestId);
});
