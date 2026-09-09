/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const state = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../src/db/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => state.call }));
import { SubjectMappingProvider, SubjectMappingReview } from '../../src/features/pedagogy/components/SubjectMappingReview';
const row = { classId: 'class', className: 'CE1', catalogLevelId: 'fr-primary-ce1', mappingVersion: 'version', status: 'not_applied', safeCount: 1, ambiguousCount: 1, missingCount: 0, progressionSuggestions: [], source: { title: 'MINEDUB niveau 2', sourceUrl: 'https://www.minedub.cm/', pdfPages: [5, 6], edition: '2018', sourceVersion: 'sha', units: [] }, mappings: [{ officialSubject: 'English language', localMatch: { id: 'ang', name: 'Anglais' }, candidates: [], referenceCandidates: [], status: 'SAFE_ALIAS', action: 'REUSE_EXISTING', reason: 'Explicit scoped alias' }, { officialSubject: 'Sciences humaines et sociales', localMatch: null, candidates: [{ id: 'h', name: 'Histoire' }], referenceCandidates: [], status: 'AMBIGUOUS', action: 'NEEDS_HUMAN_MAPPING', reason: 'Partial local discipline' }] };
const preview = () => { state.call.mockImplementation(async (data: { action: string }) => ({ data: data.action === 'preview' ? { rows: [row], secondaryRows: [] } : { status: 'proposed' } })); };
const mount = (owner = true) => render(<SubjectMappingProvider schoolId="school" yearId="year" owner={owner}><SubjectMappingReview classId="class" /></SubjectMappingProvider>);
afterEach(() => { cleanup(); state.call.mockReset(); });
it('shows safe and ambiguous mappings without an automatic write', async () => {
  preview(); mount(); await screen.findByText(/2 matières\/domaines officiels identifiés/);
  expect(state.call.mock.calls.every(([d]) => d.action === 'preview')).toBe(true);
  expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.queryByRole('checkbox')).toBeNull();
});
it('requires explicit confirmation, excludes ambiguous subjects and permits cancellation', async () => {
  preview(); mount(); const button = await screen.findByRole('button', { name: /APPLIQUER LES CORRESPONDANCES SÛRES/ });
  fireEvent.click(button); const dialog = screen.getByRole('dialog'); expect(dialog.textContent).toContain('English language → Anglais'); expect(dialog.textContent).not.toContain('Histoire');
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' })); expect(state.call.mock.calls.every(([d]) => d.action === 'preview')).toBe(true);
  fireEvent.click(button); fireEvent.click(screen.getByRole('button', { name: 'CONFIRMER LES CORRESPONDANCES SÛRES' }));
  await waitFor(() => expect(state.call).toHaveBeenCalledWith({ action: 'apply', schoolId: 'school', academicYearId: 'year', classId: 'class', expectedVersion: 'version', confirmed: true }));
});
it('keeps secretary read-only', async () => {
  preview(); mount(false); await screen.findByText(/application réservée au rôle owner/);
  expect(screen.queryByRole('button', { name: /APPLIQUER/ })).toBeNull();
});
it('reports a failed read instead of showing fake zero counts', async () => {
  state.call.mockRejectedValue(new Error('Unavailable')); mount(); await screen.findByText('Unavailable');
  expect(screen.queryByText(/officiels identifiés/)).toBeNull();
});
