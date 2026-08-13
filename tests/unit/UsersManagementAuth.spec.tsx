// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UsersManagement from '../../src/pages/UsersManagement';
import { getCreatableRoles } from '../../src/utils/authRoles';
import * as AppContextModule from '../../src/context/AppContext';

const mocks = vi.hoisted(() => ({
  createSecondaryUserForPasswordSetup: vi.fn(),
  requestPasswordReset: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn()
}));

vi.mock('../../src/db/firebase', () => ({
  db: {},
  createSecondaryUserForPasswordSetup: mocks.createSecondaryUserForPasswordSetup,
  requestPasswordReset: mocks.requestPasswordReset
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => `${collection}/${id}`),
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc
}));

describe('UsersManagement — provisioning sécurisé', () => {
  afterEach(cleanup);

  const updateLocalState = vi.fn();
  const logAuditAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSecondaryUserForPasswordSetup.mockResolvedValue({ uid: 'new-user-uid' });
    mocks.requestPasswordReset.mockResolvedValue(undefined);
    mocks.setDoc.mockResolvedValue(undefined);
    logAuditAction.mockResolvedValue(undefined);
    vi.spyOn(AppContextModule, 'useAppContext').mockReturnValue({
      db: { users: [] },
      updateLocalState,
      currentUser: { id: 'owner-a', email: 'owner@example.test', role: 'owner', schoolId: 'school-a', isActive: true },
      currentSchool: { id: 'school-a', name: 'School A' },
      logAuditAction
    } as unknown as ReturnType<typeof AppContextModule.useAppContext>);
    window.alert = vi.fn();
  });

  it('applique la whitelist ITALO par rôle administrateur', () => {
    expect(getCreatableRoles('owner')).toEqual(['director', 'secretary', 'accountant', 'teacher', 'driver']);
    expect(getCreatableRoles('director')).toEqual(['secretary', 'accountant', 'teacher', 'driver']);
    expect(getCreatableRoles('secretary')).toEqual([]);
    expect(getCreatableRoles('owner')).not.toEqual(expect.arrayContaining(['superAdmin', 'owner', 'parent', 'student', 'boardViewer']));
  });

  it('affiche correctement les statuts legacy active, isActive et status', () => {
    vi.mocked(AppContextModule.useAppContext).mockReturnValue({
      db: {
        users: [
          { id: 'active-true', email: 'a@example.test', role: 'teacher', schoolId: 'school-a', active: true },
          { id: 'active-false', email: 'b@example.test', role: 'teacher', schoolId: 'school-a', active: false },
          { id: 'is-active-true', email: 'c@example.test', role: 'teacher', schoolId: 'school-a', isActive: true },
          { id: 'is-active-false', email: 'd@example.test', role: 'teacher', schoolId: 'school-a', isActive: false },
          { id: 'status-active', email: 'e@example.test', role: 'teacher', schoolId: 'school-a', status: 'active' },
          { id: 'status-inactive', email: 'f@example.test', role: 'teacher', schoolId: 'school-a', status: 'inactive' },
          { id: 'current', email: 'g@example.test', role: 'teacher', schoolId: 'school-a', active: true, isActive: true, status: 'active' }
        ]
      },
      updateLocalState,
      currentUser: { id: 'owner-a', email: 'owner@example.test', role: 'owner', schoolId: 'school-a', isActive: true },
      currentSchool: { id: 'school-a', name: 'School A' },
      logAuditAction
    } as unknown as ReturnType<typeof AppContextModule.useAppContext>);

    render(<UsersManagement />);

    expect(screen.getAllByText('Actif')).toHaveLength(4);
    expect(screen.getAllByText('Suspendu')).toHaveLength(3);
  });

  it('crée sans password Firestore puis envoie le lien de définition', async () => {
    render(<UsersManagement />);
    fireEvent.click(screen.getByRole('button', { name: /nouvel utilisateur/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  New@Example.COM ' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'secretary' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledOnce());
    expect(mocks.createSecondaryUserForPasswordSetup).toHaveBeenCalledWith('new@example.com');
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith('new@example.com');

    const payload = mocks.setDoc.mock.calls[0][1];
    expect(payload).toMatchObject({
      id: 'new-user-uid',
      role: 'secretary',
      schoolId: 'school-a',
      active: true,
      isActive: true,
      status: 'active'
    });
    expect(payload).not.toHaveProperty('password');
    expect(payload).not.toHaveProperty('pin');
    expect(payload).not.toHaveProperty('mustChangePin');
  });

  it('retourne une erreur métier si Auth réussit mais Firestore échoue', async () => {
    mocks.setDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    render(<UsersManagement />);
    fireEvent.click(screen.getByRole('button', { name: /nouvel utilisateur/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'partial@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/profil EcoScolaire.*aucun accès applicatif/i)));
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
    expect(updateLocalState).not.toHaveBeenCalled();
  });

  it('une nouvelle tentative sur un compte Auth partiel signale le doublon', async () => {
    mocks.createSecondaryUserForPasswordSetup.mockRejectedValueOnce(
      Object.assign(new Error('already exists'), { code: 'auth/email-already-in-use' })
    );
    render(<UsersManagement />);
    fireEvent.click(screen.getByRole('button', { name: /nouvel utilisateur/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'partial@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/aucun doublon.*réconciliez/i)));
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('un échec reset conserve le profil et fournit une action de récupération', async () => {
    mocks.requestPasswordReset.mockRejectedValueOnce(new Error('reset unavailable'));
    render(<UsersManagement />);
    fireEvent.click(screen.getByRole('button', { name: /nouvel utilisateur/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'reset-failed@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/compte a été créé.*mot de passe oublié/i)));
    expect(mocks.setDoc).toHaveBeenCalledOnce();
    expect(updateLocalState).toHaveBeenCalledOnce();
    expect(logAuditAction).toHaveBeenCalledWith(expect.objectContaining({ details: { setupEmailSent: false } }));
  });
});
