/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../src/features/pedagogy/services/curriculumUnits', () => ({ loadPublishedCurriculumUnits: state.load }));
import { CurriculumUnitDetails } from '../../src/features/pedagogy/components/CurriculumUnitDetails';
afterEach(() => { cleanup(); state.load.mockReset(); });
it('shows the actual unit without inventing missing competency, hours or official provenance', async () => {
  state.load.mockResolvedValue([{ id: 'u', subjectId: 'maths', title: 'Synthetic unit', objective: 'Synthetic objective', indicativeHours: 4 }]);
  render(<CurriculumUnitDetails schoolId="a" programId="p" levelId="l" />);
  await screen.findByText('maths — Synthetic unit');
  expect(screen.getByText('Compétence : non renseignée')).toBeTruthy();
  expect(screen.getByText('Volume indicatif sourcé : non établi.')).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
});
it('clears previous units immediately when the selected scope changes', async () => {
  state.load.mockResolvedValueOnce([{ id: 'u', subjectId: 'm', title: 'Old scope' }]).mockImplementationOnce(() => new Promise(() => {}));
  const view = render(<CurriculumUnitDetails schoolId="a" programId="p" levelId="l" />);
  await screen.findByText('m — Old scope');
  view.rerender(<CurriculumUnitDetails schoolId="b" programId="q" levelId="n" />);
  expect(screen.queryByText('m — Old scope')).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('Chargement');
});
it('does not present a failed read as an empty or complete curriculum', async () => {
  state.load.mockRejectedValue(new Error('Lecture refusée'));
  render(<CurriculumUnitDetails schoolId="a" programId="p" levelId="l" />);
  expect((await screen.findByRole('alert')).textContent).toBe('Lecture refusée');
  expect(screen.queryByText(/Aucune unité publiée/)).toBeNull();
});
