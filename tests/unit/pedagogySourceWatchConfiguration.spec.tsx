/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SourceWatchConfiguration } from '../../src/features/pedagogy/components/SourceWatchConfiguration';
const fake = vi.hoisted(() => ({ call: vi.fn(), refresh: vi.fn(async () => {}), data: [] as Array<Record<string, unknown>> }));
vi.mock('../../src/db/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => fake.call }));
vi.mock('../../src/features/pedagogy/hooks/useScopedResource', () => ({ useScopedResource: () => ({ data: fake.data, loading: false, error: '', refresh: fake.refresh }) }));
beforeEach(() => { fake.data = [{ id: 'synthetic--1', slot: 1, title: 'Synthetic source', url: 'https://www.minedub.cm/', intervalMinutes: 1440, enabled: false, version: 1, status: 'not_checked' }]; });
afterEach(() => { cleanup(); vi.clearAllMocks(); fake.call.mockReset(); });
it('provides read-only secretary visibility without inferring authenticity or freshness', () => {
  render(<SourceWatchConfiguration schoolId="synthetic" canEdit={false} />);
  expect((screen.getByLabelText('Titre de la source') as HTMLInputElement).disabled || screen.getByLabelText('Titre de la source').closest('fieldset')?.disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Enregistrer la veille' })).toBeNull();
  expect(screen.getByText('Jamais vérifiée')).toBeTruthy();
  expect(screen.getByText(/Aucun contenu n’est adopté ou publié automatiquement/)).toBeTruthy();
});
it('shows failed freshness checks and pending human review together', () => {
  fake.data[0] = { ...fake.data[0], status: 'failed', lastError: 'SOURCE_TIMEOUT', pendingReview: true };
  render(<SourceWatchConfiguration schoolId="synthetic" canEdit />);
  expect(screen.getByText(/fraîcheur non vérifiée/)).toBeTruthy();
  expect(screen.getByText(/Un changement reste à examiner/)).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('SOURCE_TIMEOUT');
});
it('locks a modified scope and requires reload after an uncertain save', async () => {
  fake.call.mockRejectedValueOnce(new Error('Synthetic uncertainty'));
  render(<SourceWatchConfiguration schoolId="synthetic" canEdit />);
  fireEvent.change(screen.getByLabelText('Titre de la source'), { target: { value: 'Changed source title' } });
  expect((screen.getByLabelText('Emplacement de veille') as HTMLSelectElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la veille' }));
  await waitFor(() => expect(screen.getByText(/Synthetic uncertainty/)).toBeTruthy());
  expect(fake.call).toHaveBeenCalledTimes(1);
  expect(fake.call.mock.calls[0][0]).toMatchObject({ schoolId: 'synthetic', slot: 1, expectedVersion: 1, title: 'Changed source title' });
  expect((screen.getByRole('button', { name: 'Enregistrer la veille' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Recharger la configuration enregistrée' }));
  await waitFor(() => expect((screen.getByLabelText('Titre de la source') as HTMLInputElement).value).toBe('Synthetic source'));
  expect(fake.call).toHaveBeenCalledTimes(1);
});
