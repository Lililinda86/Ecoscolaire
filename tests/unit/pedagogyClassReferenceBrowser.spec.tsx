/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ school: 'a' }));
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({ currentSchool: { id: state.school }, db: { classes: [{ id: 'legacy', schoolId: 'a', name: 'CE1', type: 'francophone' }, { id: 'other', schoolId: 'b', name: 'Class 3', type: 'anglophone' }] } }) }));
import { ClassReferenceBrowser } from '../../src/features/pedagogy/components/ClassReferenceBrowser';
afterEach(() => { cleanup(); state.school = 'a'; });
it('uses the historical type field and does not show another school class', () => {
  const view = render(<ClassReferenceBrowser />);
  expect(screen.queryByRole('option', { name: 'Class 3' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Classe à consulter'), { target: { value: 'legacy' } });
  expect(screen.getByText('Mathématiques')).toBeTruthy();
  expect(screen.getByText('PARTIAL')).toBeTruthy();
  state.school = 'b'; view.rerender(<ClassReferenceBrowser />);
  expect(screen.queryByText('Mathématiques')).toBeNull();
});
