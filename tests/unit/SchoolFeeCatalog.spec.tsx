/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ role: 'secretary' }));
import { SchoolFeeCatalog } from '../../src/components/Settings/SchoolFeeCatalog';
vi.mock('../../src/db/firebase', () => ({ functions: {} }));
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({
  currentUser: { role: mocks.role }, db: { school: { id: 'test', academicYear: '2026-2027' }, students: [], classes: [] }
}) }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: { fees: [
  { id: 'fee-test', label: 'Tenue de sport test', category: 'sports_uniform', amount: 15000, mandatory: false, active: true, schemaVersion: 2 },
  { id: 'fee-ceremony', label: 'Tenue de cérémonie', category: 'uniform', amount: 20000, mandatory: true, active: true, schemaVersion: 2 },
  { id: 'fee-kit', label: "Kit d’activités", category: 'activity', amount: 7500, mandatory: false, active: true, schemaVersion: 2 },
  { id: 'fee-trip', label: 'Sortie pédagogique', category: 'excursion', amount: 5000, mandatory: false, active: false, schemaVersion: 2 },
  { id: 'fee-legacy', label: 'Ancien frais conservé', amount: 2500, mandatory: true, active: true }
] } }) }));
afterEach(() => { cleanup(); mocks.role = 'secretary'; });
it('shows the authoritative catalogue amount with exactly one currency suffix', async () => {
  render(<SchoolFeeCatalog />);
  const fee = await screen.findByText('Tenue de sport test');
  const text = fee.closest('li')?.textContent || '';
  expect(text.replace(/\s/g, '')).toContain('15000FCFA');
  expect(text.match(/FCFA/g)).toHaveLength(1);
});

it('offers childcare and requires a precise label for the generic other category', async () => {
  mocks.role = 'director';
  render(<SchoolFeeCatalog />);
  await screen.findByText('Tenue de sport test');
  const category = screen.getByLabelText('Type de frais');
  expect(screen.getByRole('option', { name: 'Garderie' })).toBeTruthy();
  fireEvent.change(category, { target: { value: 'other' } });
  expect(screen.getByLabelText('Précisez le libellé du frais').hasAttribute('required')).toBe(true);
});

it('structures configurable uniform and other-fee subtypes without hiding exact labels', async () => {
  render(<SchoolFeeCatalog />);
  await screen.findByText('Tenue de sport test');
  expect(screen.getByRole('heading', { name: 'Tenues' })).toBeTruthy();
  expect(screen.getByText('Tenue de cérémonie')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Activités / événements' })).toBeTruthy();
  expect(screen.getByText("Kit d’activités")).toBeTruthy();
  expect(screen.getByText('Sortie pédagogique')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Autres frais' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Frais ponctuels' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Catalogue historique' })).toBeTruthy();
  expect(screen.getByText('Ancien frais conservé')).toBeTruthy();
});

it('offers every required subtype to directors while preserving free labels', async () => {
  mocks.role = 'director';
  render(<SchoolFeeCatalog />);
  await screen.findByText('Tenue de sport test');
  for (const name of ['Tenue scolaire', 'Tenue de sport', 'Tenue de cérémonie', 'Autre type de tenue',
    "Kit d’activités", "Fête de l’école", 'Excursion', 'Sortie pédagogique', 'Photos scolaires',
    'Activité culturelle', 'Fournitures / supports', 'Autre libellé libre']) {
    expect(screen.getByRole('option', { name })).toBeTruthy();
  }
});
