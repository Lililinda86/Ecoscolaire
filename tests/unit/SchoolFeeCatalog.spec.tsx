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
  { id: 'fee-test', label: 'Tenue de sport test', amount: 15000, mandatory: false, active: true, schemaVersion: 2 }
] } }) }));
afterEach(() => { cleanup(); mocks.role = 'secretary'; });
it('shows the authoritative catalogue amount with exactly one currency suffix', async () => {
  render(<SchoolFeeCatalog />);
  await screen.findByText('Tenue de sport test');
  const text = screen.getByText(/Facultatif/).textContent || '';
  expect(text.replace(/\s/g, '')).toContain('15000FCFA');
  expect(text.match(/FCFA/g)).toHaveLength(1);
});

it('offers childcare and requires a precise label for the generic other category', async () => {
  render(<SchoolFeeCatalog />);
  mocks.role = 'director';
  await screen.findByText('Tenue de sport test');
  const category = screen.getByLabelText('Catégorie');
  expect(screen.getByRole('option', { name: 'Garderie' })).toBeTruthy();
  fireEvent.change(category, { target: { value: 'other' } });
  expect(screen.getByLabelText('Précisez le libellé du frais').hasAttribute('required')).toBe(true);
});
