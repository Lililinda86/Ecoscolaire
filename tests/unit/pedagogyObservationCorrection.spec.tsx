/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ObservationCorrectionForm } from '../../src/features/pedagogy/pages/PedagogyStudentFollowUp';

const fake = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../src/db/firebase', () => ({ db: {}, functions: {} }));
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({}) }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => fake.call }));
afterEach(() => { cleanup(); vi.clearAllMocks(); fake.call.mockReset(); });
const original = { id: 'observation', studentId: 'pupil', preparationId: 'prep', objective: 'Exact objective', state: 'developing', date: '2026-09-06' };
const teachers = [{ id: 'teacher', name: 'Synthetic teacher' }];
function open(onSaved = vi.fn(async () => {})) {
  render(<ObservationCorrectionForm schoolId="school" academicYearId="year" classId="class" original={original} teachers={teachers} onSaved={onSaved} />);
  fireEvent.click(screen.getByText('Rectifier cette observation sur déclaration reçue'));
  return onSaved;
}
function fill() {
  fireEvent.change(screen.getByLabelText('État rectifié'), { target: { value: 'acquired' } });
  fireEvent.change(screen.getByLabelText('Contexte corrigé et motif reçu'), { target: { value: 'Synthetic received correction and reason' } });
  fireEvent.change(screen.getByLabelText('Enseignant déclarant la rectification'), { target: { value: 'teacher' } });
  fireEvent.click(screen.getByLabelText('J’ai reçu cette rectification de l’enseignant sélectionné.'));
}
it('requires received teacher correction and supersedes exactly the selected observation', async () => {
  fake.call.mockResolvedValue({ data: {} });
  const saved = open();
  expect((screen.getByRole('button', { name: 'Enregistrer la rectification reçue' }) as HTMLButtonElement).disabled).toBe(true);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la rectification reçue' }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(fake.call.mock.calls[0][0]).toMatchObject({ schoolId: 'school', academicYearId: 'year', classId: 'class', preparationId: 'prep', objective: 'Exact objective', declarationReceived: true, teacherStaffId: 'teacher', rows: [{ studentId: 'pupil', state: 'acquired', supersedesId: 'observation' }] });
});
it('locks an uncertain correction and retries the same immutable payload', async () => {
  fake.call.mockRejectedValueOnce(Object.assign(new Error('Synthetic network failure'), { code: 'functions/unavailable' })).mockResolvedValueOnce({ data: {} });
  open(); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la rectification reçue' }));
  const retry = await screen.findByRole('button', { name: 'Reprendre la même rectification' });
  expect(screen.getByLabelText('Contexte corrigé et motif reçu').closest('fieldset')?.disabled).toBe(true);
  fireEvent.click(retry);
  await waitFor(() => expect(fake.call).toHaveBeenCalledTimes(2));
  expect(fake.call.mock.calls[1][0]).toEqual(fake.call.mock.calls[0][0]);
});
