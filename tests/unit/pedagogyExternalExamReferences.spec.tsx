/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ExternalExamReferences } from '../../src/features/pedagogy/components/ExternalExamReferences';
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({ currentSchool: { id: 'school' }, db: { classes: [
  { id: 'one', schoolId: 'school', catalogLevelId: 'en-secondary-form5', name: 'Local Form 5' },
  { id: 'foreign', schoolId: 'other', catalogLevelId: 'en-secondary-form5', name: 'Foreign class' },
] } }) }));
afterEach(cleanup);
it('separates actual session reports from copyright and syllabus years', () => {
  render(<ExternalExamReferences />);
  expect(screen.getByRole('status').textContent).toBe('7 référence(s) externe(s).');
  const sessions = screen.getByRole('combobox', { name: 'Session des références externes' });
  expect(within(sessions).queryByRole('option', { name: '2026' })).toBeNull();
  fireEvent.change(sessions, { target: { value: '2023' } });
  expect(screen.getByRole('status').textContent).toBe('2 référence(s) externe(s).');
  fireEvent.change(screen.getByRole('combobox', { name: 'Matière des références externes' }), { target: { value: 'Mathematics' } });
  expect(screen.getByRole('status').textContent).toBe('1 référence(s) externe(s).');
  expect(screen.getByText('GCE Ordinary Level — Subject Report 2023')).toBeTruthy();
});
it('keeps a specimen distinct and never invents class applicability or tenant access', () => {
  render(<ExternalExamReferences />);
  expect(screen.queryByText('Foreign class')).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'Type des références externes' }), { target: { value: 'Spécimen officiel' } });
  expect(screen.getByRole('status').textContent).toBe('1 référence(s) externe(s).');
  expect(screen.getByText(/pas une annale/)).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Classe des références externes' }), { target: { value: 'one' } });
  expect(screen.getByRole('status').textContent).toBe('0 référence(s) externe(s).');
  expect(screen.queryByRole('button', { name: /adopter|valider|appliquer/i })).toBeNull();
});
