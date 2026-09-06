/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SchoolFeeCatalog } from '../../src/components/Settings/SchoolFeeCatalog';
vi.mock('../../src/db/firebase', () => ({ functions: {} }));
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({
  currentUser: { role: 'secretary' }, db: { school: { id: 'test', academicYear: '2026-2027' }, students: [], classes: [] }
}) }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: { fees: [
  { id: 'fee-test', label: 'Tenue de sport test', amount: 15000, mandatory: false, active: true, schemaVersion: 2 }
] } }) }));
afterEach(cleanup);
it('shows the authoritative catalogue amount with exactly one currency suffix', async () => {
  render(<SchoolFeeCatalog />);
  await screen.findByText('Tenue de sport test');
  const text = screen.getByText(/Facultatif/).textContent || '';
  expect(text.replace(/\s/g, '')).toContain('15000FCFA');
  expect(text.match(/FCFA/g)).toHaveLength(1);
});
