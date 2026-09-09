/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const state = vi.hoisted(() => ({ call: vi.fn(), load: vi.fn().mockResolvedValue([]), school: 'a', role: 'owner' }));
vi.mock('../../src/db/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), query: vi.fn(), where: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => state.call }));
vi.mock('../../src/features/pedagogy/services/boundedQuery', () => ({ readBoundedDocuments: state.load }));
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({ currentSchool: { id: state.school }, currentUser: { id: 'owner', role: state.role }, db: { classes: [{ id: 'a-class', name: 'SIL', schoolId: 'a', catalogLevelId: 'fr-primary-sil' }, { id: 'b-class', name: 'Class 1', schoolId: 'b', catalogLevelId: 'en-primary-1' }] } }) }));
import { CurriculumProposalReview, ReviewScope } from '../../src/features/pedagogy/components/CurriculumProposalReview';
import { curriculumReviewProposals as proposals } from '../../src/features/pedagogy/resources/curriculumReviewManifest';
const rows = proposals.map(proposal => ({ classId: proposal.id, className: proposal.name, proposal }));
const renderAll = () => render(<ReviewScope schoolId="a" yearId="year" owner rows={rows} />);
afterEach(() => { cleanup(); state.load.mockReset().mockResolvedValue([]); state.call.mockReset().mockResolvedValue({ data: {} }); state.school = 'a'; state.role = 'owner'; });
it('renders all 34 proposals and six groups with 12 recommendations and no preselection', async () => {
  renderAll(); await screen.findByText('34 classes actives');
  expect(screen.getAllByTestId(/^proposal-/)).toHaveLength(34);
  expect(new Set(proposals.map(p => p.group)).size).toBe(6);
  expect(screen.getAllByRole('checkbox')).toHaveLength(12);
  for (const checkbox of screen.getAllByRole('checkbox')) expect((checkbox as HTMLInputElement).checked).toBe(false);
  for (const select of screen.getAllByRole('combobox')) expect((select as HTMLSelectElement).value).toBe('');
  expect(screen.getByText('12 propositions forte confiance')).toBeTruthy();
  expect(screen.getByText('22 à examiner')).toBeTruthy();
  expect(state.call).not.toHaveBeenCalled();
});
it('requires explicit individual choice, note and confirmation, then refreshes the counter', async () => {
  renderAll(); await waitFor(() => expect(screen.queryByText('Chargement des décisions…')).toBeNull());
  fireEvent.change(screen.getByLabelText('Choix — D01'), { target: { value: 'APPROVED' } });
  fireEvent.change(screen.getByLabelText('Note — D01'), { target: { value: 'Synthetic review' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la décision — D01' }));
  expect(state.call).not.toHaveBeenCalled();
  state.load.mockResolvedValue([{ id: 'review', schoolId: 'a', academicYearId: 'year', classId: 'D01', proposalId: 'D01', sourceVersion: proposals[0].sourceVersion, mappingVersion: proposals[0].mappingVersion, decision: 'APPROVED', revision: 1 }]);
  fireEvent.click(screen.getByRole('button', { name: 'CONFIRMER L’ENREGISTREMENT' }));
  await screen.findByText('1 approuvées');
  expect(state.call).toHaveBeenCalledWith(expect.objectContaining({ confirmed: true, items: [expect.objectContaining({ classId: 'D01', sourceVersion: proposals[0].sourceVersion, mappingVersion: proposals[0].mappingVersion, expectedRevision: 0 })] }));
});
it('group approval includes only explicitly selected high confidence rows and can be cancelled', async () => {
  renderAll(); await waitFor(() => expect(screen.queryByText('Chargement des décisions…')).toBeNull());
  fireEvent.click(screen.getByLabelText('Sélectionner D01')); fireEvent.click(screen.getByLabelText('Sélectionner D07'));
  fireEvent.change(screen.getByLabelText('Note de décision groupée'), { target: { value: 'Synthetic group' } });
  fireEvent.click(screen.getByRole('button', { name: 'APPROUVER LES SÉLECTIONNÉES' }));
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' })); expect(state.call).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'APPROUVER LES SÉLECTIONNÉES' }));
  fireEvent.click(screen.getByRole('button', { name: 'CONFIRMER L’ENREGISTREMENT' }));
  await waitFor(() => expect(state.call).toHaveBeenCalledTimes(1));
  expect(state.call.mock.calls[0][0].items.map((i: { classId: string }) => i.classId)).toEqual(['D01', 'D07']);
});
it('missing sources cannot be approved; old source versions are not current decisions', async () => {
  state.load.mockResolvedValue([{ schoolId: 'a', academicYearId: 'year', classId: 'D01', proposalId: 'D01', sourceVersion: 'old', mappingVersion: 'old', decision: 'APPROVED' }]);
  renderAll(); await waitFor(() => expect(screen.queryByText('Chargement des décisions…')).toBeNull());
  const select = screen.getByLabelText('Choix — D27') as HTMLSelectElement;
  expect(select.options[1].disabled).toBe(true); expect(screen.getByText('0 approuvées')).toBeTruthy();
  expect((screen.getByLabelText('Choix — D13') as HTMLSelectElement).options[1].disabled).toBe(false);
  expect(screen.queryByLabelText('Sélectionner D13')).toBeNull();
  expect(screen.queryByLabelText('Sélectionner D27')).toBeNull();
});
it('tenant changes clear selection and secretary is consultation only', async () => {
  const view = render(<CurriculumProposalReview yearId="year" />);
  await waitFor(() => expect(screen.queryByText('Chargement des décisions…')).toBeNull());
  fireEvent.click(screen.getByLabelText('Sélectionner D01'));
  state.school = 'b'; view.rerender(<CurriculumProposalReview yearId="year" />);
  expect(screen.queryByTestId('proposal-D01')).toBeNull(); expect((screen.getByLabelText('Sélectionner D07') as HTMLInputElement).checked).toBe(false);
  state.role = 'secretary'; view.rerender(<CurriculumProposalReview yearId="year" />);
  expect(screen.queryByRole('checkbox')).toBeNull(); expect(screen.queryByRole('combobox')).toBeNull();
});
