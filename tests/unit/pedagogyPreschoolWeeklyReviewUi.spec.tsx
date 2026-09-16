/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PreschoolWeeklyReview } from '../../src/features/pedagogy/components/PreschoolWeeklyReview';
const state = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../src/db/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => state.call }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); state.call.mockReset(); });
const scope = { schoolId: 'school', academicYearId: 'year', classId: 'class', weekId: 'week' };
const fixture = { id: 'review', className: 'Synthetic nursery', weekStartDate: '2026-09-14', weekEndDate: '2026-09-18', generationVersion: 1, status: 'needs_review', teacherValidated: false, title: 'Preschool weekly review', notice: 'Qualitative guide, no marks or diagnosis.', language: 'en', sourceChecksum: 'source', teacherValidations: [], excluded: [], activities: [{ preparationId: 'prep', preparationVersion: 1, subjectId: 'domain', domainLabel: 'Literacy', confirmationId: 'confirmed', effectiveDate: '2026-09-15', partial: true, confirmedContent: 'Name the cup.', observationPrompt: 'Observe the same activity.', adaptationPrompt: 'Repeat with help.' }] };
const mount = () => render(<MemoryRouter><PreschoolWeeklyReview scope={scope} teachers={[{ id: 'teacher', name: 'Synthetic teacher' }]} /></MemoryRouter>);
it('starts read-only; exposes no score, no preselected teacher agreement and keeps a draft watermark', async () => {
  state.call.mockResolvedValue({ data: { review: fixture, sourceChanged: false, availableActivityCount: 1 } }); mount();
  await screen.findByText('Name the cup.');
  expect(screen.getByText('DRAFT — TEACHER REVIEW REQUIRED')).toBeTruthy(); expect(screen.queryByRole('spinbutton')).toBeNull();
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole('button', { name: 'Enregistrer l’accord reçu' }) as HTMLButtonElement).disabled).toBe(true);
  expect(state.call.mock.calls.every(([input]) => input.operation === 'read')).toBe(true);
});
it('records only an explicit received declaration with exact scope/version/checksum', async () => {
  state.call.mockResolvedValue({ data: { review: fixture, sourceChanged: false, availableActivityCount: 1 } }); mount(); await screen.findByText('Name the cup.');
  fireEvent.change(screen.getByLabelText('Domaine'), { target: { value: 'domain' } });
  fireEvent.change(screen.getByLabelText('Enseignant responsable'), { target: { value: 'teacher' } });
  fireEvent.change(screen.getByLabelText('Note de déclaration'), { target: { value: 'Synthetic received agreement' } });
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l’accord reçu' }));
  await waitFor(() => expect(state.call).toHaveBeenCalledWith({ ...scope, operation: 'record_teacher_agreement', expectedVersion: 1, sourceChecksum: 'source', subjectId: 'domain', teacherStaffId: 'teacher', note: 'Synthetic received agreement', declarationReceived: true }));
});
it('requires confirmation for regeneration and hides approval of a stale source', async () => {
  state.call.mockResolvedValue({ data: { review: fixture, sourceChanged: true, availableActivityCount: 1 } });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false); mount(); await screen.findByText('Name the cup.');
  expect(screen.queryByRole('checkbox')).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Actualiser le bilan explicitement' }));
  expect(confirm).toHaveBeenCalledOnce(); expect(state.call.mock.calls.every(([input]) => input.operation === 'read')).toBe(true);
});
