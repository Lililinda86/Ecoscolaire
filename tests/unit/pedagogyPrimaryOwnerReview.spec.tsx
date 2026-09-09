/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_SUBJECT_CATALOG } from '../../functions/src/academic/defaultSubjectCatalog';
import { minedubSubjectIndex } from '../../src/features/pedagogy/resources/minedubSubjectIndex';
import { matchOfficialSubjects, primaryDocumentByLevel } from '../../src/features/pedagogy/services/subjectMapping';
import { SubjectMappingProvider, type SubjectDecision, type SubjectReviewRow } from '../../src/features/pedagogy/components/SubjectMappingReview';
import { PrimarySubjectSteps } from '../../src/features/pedagogy/components/PrimarySubjectSteps';
const state = vi.hoisted(() => ({ call: vi.fn(), decisions: [] as unknown[] }));
vi.mock('../../src/db/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => state.call }));
const catalog = DEFAULT_SUBJECT_CATALOG.map(s => ({ ...s, id: s.internalCode, schoolId: 'school', isActive: true }));
const rows: SubjectReviewRow[] = Object.entries(primaryDocumentByLevel).map(([level, documentId]) => {
  const source = minedubSubjectIndex.find(s => s.documentId === documentId)!;
  const mappings = matchOfficialSubjects(source.names, catalog, 'school', level.startsWith('fr') ? 'francophone' : 'anglophone');
  return { classId: level, className: level, catalogLevelId: level, mappings, safeCount: mappings.filter(m => m.localMatch).length, ambiguousCount: mappings.filter(m => m.status === 'AMBIGUOUS').length, missingCount: 0, mappingVersion: 'mapping-' + level, status: 'not_applied', progressionSuggestions: [], source: { title: documentId, sourceUrl: 'https://www.minedub.cm', sourceVersion: 'source-' + documentId, edition: '2018', pdfPages: [5], units: [] } };
});
function mount(owner = true, approvedLevels: string[] = []) {
  state.call.mockImplementation(async (data: { action: string; items?: SubjectDecision[] }) => {
    if (data.action === 'preview') return { data: { rows, secondaryRows: [], decisions: state.decisions } };
    state.decisions = data.items!.map(i => ({ ...i, revision: 1 })); return { data: {} };
  });
  return render(<SubjectMappingProvider schoolId="school" yearId="year" owner={owner}><PrimarySubjectSteps approvedLevels={approvedLevels} levelsAvailable={12} levelsLoading={false} /></SubjectMappingProvider>);
}
afterEach(() => { cleanup(); state.call.mockReset(); state.decisions = []; });
it('shows exactly 76 safe and 44 ambiguous mappings, none selected, no source hashes visible by default', async () => {
  mount(); await screen.findByText('MAPPINGS SÛRS : 0/76 validés');
  expect(screen.getAllByTestId('primary-safe-mapping')).toHaveLength(76);
  expect(screen.getAllByTestId('primary-ambiguous-mapping')).toHaveLength(44);
  for (const box of screen.getAllByRole('checkbox')) expect((box as HTMLInputElement).checked).toBe(false);
  for (const select of screen.getAllByRole('combobox')) expect((select as HTMLSelectElement).value).toBe('');
  expect(state.call.mock.calls.every(([d]) => d.action === 'preview')).toBe(true);
});
it('confirms only selected safe subjects with class/count recap, cancellation and current versions', async () => {
  mount(); await screen.findByText('MAPPINGS SÛRS : 0/76 validés');
  fireEvent.click(screen.getByLabelText('Sélectionner les mappings sûrs — fr-primary-sil'));
  const apply = screen.getByRole('button', { name: 'APPLIQUER LES CORRESPONDANCES SÛRES SÉLECTIONNÉES' });
  fireEvent.click(apply); expect(screen.getByRole('dialog').textContent).toContain('1 classe(s) · 7 correspondance(s)');
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' })); expect(state.decisions).toHaveLength(0);
  fireEvent.click(apply); fireEvent.click(screen.getByRole('button', { name: 'CONFIRMER LES DÉCISIONS DE MATIÈRES' }));
  await screen.findByText('MAPPINGS SÛRS : 7/76 validés');
  expect(state.decisions).toHaveLength(7); expect(state.decisions.every(i => (i as SubjectDecision).decision === 'APPROVED')).toBe(true);
  expect(screen.queryByText('MAPPING VALIDÉ', { exact: false })).toBeNull();
});
it('shows mapping validated only with an approved current level and current subject version', async () => {
  const row = rows[0], m = row.mappings.find(m => m.localMatch)!;
  state.decisions = [{ classId: row.classId, officialSubject: m.officialSubject, sourceVersion: row.source.sourceVersion, mappingVersion: row.mappingVersion, decision: 'APPROVED' }];
  mount(true, [row.classId]); await screen.findByText(/MAPPING VALIDÉ/);
});
it('requires explicit candidate and note for LINK, defer stays pending', async () => {
  mount(); await screen.findByText('AMBIGUÏTÉS : 0/44 résolues');
  const card = screen.getAllByTestId('primary-ambiguous-mapping')[0], ui = within(card);
  fireEvent.change(ui.getByRole('combobox'), { target: { value: 'LINK' } });
  expect((ui.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(ui.getByRole('combobox', { name: /Décision ambiguë/ }), { target: { value: 'DEFER' } });
  fireEvent.change(ui.getByRole('textbox'), { target: { value: 'Synthetic human deferral' } });
  fireEvent.click(ui.getByRole('button')); fireEvent.click(screen.getByRole('button', { name: 'CONFIRMER LES DÉCISIONS DE MATIÈRES' }));
  await waitFor(() => expect(state.decisions).toHaveLength(1));
  await screen.findByText('AMBIGUÏTÉS : 0/44 résolues');
});
it('secretary can read but cannot select or decide', async () => {
  mount(false); await screen.findByText('MAPPINGS SÛRS : 0/76 validés');
  expect(screen.queryByRole('checkbox')).toBeNull(); expect(screen.queryByRole('combobox')).toBeNull(); expect(screen.queryByRole('button')).toBeNull();
});
it('does not count an old mapping version as a current approval', async () => {
  state.decisions = [{ classId: rows[0].classId, officialSubject: rows[0].mappings[0].officialSubject, sourceVersion: rows[0].source.sourceVersion, mappingVersion: 'old', decision: 'APPROVED' }];
  mount(); await screen.findByText('MAPPINGS SÛRS : 0/76 validés');
});
