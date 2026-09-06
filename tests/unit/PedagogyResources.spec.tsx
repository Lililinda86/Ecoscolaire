/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PedagogyResources from '../../src/features/pedagogy/pages/PedagogyResources';

vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({ currentUser: { role: 'secretary' } }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const open = () => render(<MemoryRouter><PedagogyResources /></MemoryRouter>);
it('filters actual bilingual resources and keeps missing integrations explicit', () => {
  open();
  expect(screen.getByRole('status').textContent).toContain('8 modèle');
  fireEvent.change(screen.getByLabelText('Langue'), { target: { value: 'en' } });
  fireEvent.change(screen.getByLabelText('Cycle'), { target: { value: 'pre_nursery' } });
  expect(screen.getByRole('status').textContent).toContain('1 modèle');
  expect(screen.getByText('Explore and name familiar objects')).toBeTruthy();
  expect(screen.getByText(/CEDUC : connexion et droits de réutilisation non vérifiés/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Recherche'), { target: { value: 'no matching resource' } });
  expect(screen.getByText('Aucun modèle pour ces filtres.')).toBeTruthy();
});
it('exports the selected draft locally and releases the download URL', () => {
  vi.useFakeTimers();
  const create = vi.fn(() => 'blob:synthetic-local-draft'), revoke = vi.fn();
  vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    expect(this.download).toBe('original-pre-en-v1.txt');
    expect(this.href).toBe('blob:synthetic-local-draft');
  });
  open();
  fireEvent.change(screen.getByLabelText('Langue'), { target: { value: 'en' } });
  fireEvent.change(screen.getByLabelText('Cycle'), { target: { value: 'pre_nursery' } });
  fireEvent.click(screen.getByText('Download draft text'));
  expect(create).toHaveBeenCalledTimes(1);
  expect(click).toHaveBeenCalledTimes(1);
  vi.runAllTimers();
  expect(revoke).toHaveBeenCalledWith('blob:synthetic-local-draft');
});
