/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MaterialLibrary } from '../../src/features/pedagogy/components/MaterialLibrary';
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({ currentSchool: { id: 'school' }, db: { classes: [
  { id: 'one', schoolId: 'school', catalogLevelId: 'fr-preschool-pre', name: 'Nom ITALO conservé', isActive: true },
  { id: 'two', schoolId: 'other-school', catalogLevelId: 'en-nursery-1', name: 'Foreign class', isActive: true },
  { id: 'unknown', schoolId: 'school', name: 'Sans niveau documenté', isActive: true },
] } }) }));
afterEach(cleanup);
it('limits the class selector to the current tenant and filters without making decisions', () => {
  render(<MaterialLibrary />);
  expect(screen.queryByText('Foreign class')).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('134 ressource');
  fireEvent.change(screen.getByRole('combobox', { name: 'Classe de la bibliothèque' }), { target: { value: 'one' } });
  expect(screen.getByRole('status').textContent).toContain('6 ressource');
  fireEvent.change(screen.getByRole('combobox', { name: 'Source documentaire' }), { target: { value: 'ITALO' } });
  expect(screen.getByRole('status').textContent).toContain('5 ressource');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: /approuver|adopter/i })).toBeNull();
});
it('does not fall back to all content when a class has no documented catalog level', () => {
  render(<MaterialLibrary />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Classe de la bibliothèque' }), { target: { value: 'unknown' } });
  expect(screen.getByRole('status').textContent).toContain('0 ressource');
  expect(screen.getByText(/aucun contenu n’est inventé/)).toBeTruthy();
});
