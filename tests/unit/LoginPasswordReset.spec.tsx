// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Login from '../../src/pages/Login';
import * as AppContextModule from '../../src/context/AppContext';

const mocks = vi.hoisted(() => ({ requestPasswordReset: vi.fn() }));

vi.mock('../../src/db/firebase', () => ({ requestPasswordReset: mocks.requestPasswordReset }));

describe('Login — récupération du mot de passe', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestPasswordReset.mockResolvedValue(undefined);
    vi.spyOn(AppContextModule, 'useAppContext').mockReturnValue({
      login: vi.fn(),
      isFirestoreConnected: true,
      firestoreError: null
    } as unknown as ReturnType<typeof AppContextModule.useAppContext>);
  });

  it('appelle le reset Firebase et garde un message générique', async () => {
    render(<Login />);
    fireEvent.click(screen.getByRole('button', { name: /mot de passe oublié/i }));
    fireEvent.change(screen.getAllByPlaceholderText('votre@email.com')[1], { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer la demande/i }));

    await waitFor(() => expect(mocks.requestPasswordReset).toHaveBeenCalledWith('user@example.com'));
    expect(await screen.findByText(/si cet identifiant correspond à un compte/i)).toBeTruthy();
  });

  it('affiche la même réponse lorsque Firebase refuse la demande', async () => {
    mocks.requestPasswordReset.mockRejectedValueOnce(new Error('not found'));
    render(<Login />);
    fireEvent.click(screen.getByRole('button', { name: /mot de passe oublié/i }));
    fireEvent.change(screen.getAllByPlaceholderText('votre@email.com')[1], { target: { value: 'missing@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer la demande/i }));

    expect(await screen.findByText(/si cet identifiant correspond à un compte/i)).toBeTruthy();
  });
});
