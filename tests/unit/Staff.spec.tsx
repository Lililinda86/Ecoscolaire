// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StaffPage from '../../src/pages/Staff';
import * as AppContextModule from '../../src/context/AppContext';
import * as I18nContextModule from '../../src/context/I18nContext';
import type { Staff } from '../../src/types';

vi.mock('../../src/db/firebase', () => ({
  db: {}
}));

const { mockSetDoc } = vi.hoisted(() => ({
  mockSetDoc: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, collection, id) => `${collection}/${id}`),
  setDoc: mockSetDoc,
  collection: vi.fn(),
  runTransaction: vi.fn()
}));

describe('B. Personnel (Staff.tsx) - Flux de persistance', () => {
  const mockUpdateLocalState = vi.fn();
  const mockSafeMergeDB = vi.fn();

  const mockContextValue = {
    db: {
      staff: [
        { id: 's1', schoolId: 'school-1', firstName: 'Active', lastName: 'Teacher', staffType: 'teacher', employmentStatus: 'active' }
      ] as Staff[],
      classes: []
    },
    updateLocalState: mockUpdateLocalState,
    safeMergeDB: mockSafeMergeDB,
    currentSchool: { id: 'school-1', name: 'School 1' },
    isSchoolSuspended: false,
    currentUser: { id: 'u1', role: 'director', schoolId: 'school-1' }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AppContextModule, 'useAppContext').mockReturnValue(mockContextValue as unknown as ReturnType<typeof AppContextModule.useAppContext>);
    vi.spyOn(I18nContextModule, 'useI18n').mockReturnValue({ t: (k: string) => k, locale: 'fr', setLocale: () => {} } as unknown as ReturnType<typeof I18nContextModule.useI18n>);
    window.confirm = vi.fn().mockReturnValue(true);
    window.alert = vi.fn();
  });

  it('A. Création réussie', async () => {
    mockSetDoc.mockResolvedValueOnce(undefined);
    render(<StaffPage />);

    const addBtn = screen.getAllByText('add')[0];
    fireEvent.click(addBtn);

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'New' } });
    fireEvent.change(inputs[1], { target: { value: 'Person' } });

    fireEvent.submit(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
    });

    expect(mockUpdateLocalState).toHaveBeenCalledTimes(1);
    const passedDb = mockUpdateLocalState.mock.calls[0][0].staff;
    expect(passedDb.length).toBe(2);
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('succès'));
  });

  it('B. Écriture refusée', async () => {
    const error = new Error('Permission denied') as Error & { code?: string };
    error.code = 'permission-denied';
    mockSetDoc.mockRejectedValueOnce(error);
    render(<StaffPage />);

    const addBtn = screen.getAllByText('add')[0];
    fireEvent.click(addBtn);

    fireEvent.submit(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
    });

    expect(mockUpdateLocalState).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('refusé par les règles de sécurité'));
  });

  it('C. Mauvaise configuration', async () => {
    mockSetDoc.mockRejectedValueOnce(new Error('Network error'));
    render(<StaffPage />);

    const addBtn = screen.getAllByText('add')[0];
    fireEvent.click(addBtn);

    fireEvent.submit(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
    });

    expect(mockUpdateLocalState).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Impossible d’enregistrer'));
  });

  it('D. Double clic bloqué (isSubmitting)', async () => {
    let resolvePromise: (value?: unknown) => void;
    const promise = new Promise((resolve) => { resolvePromise = resolve; });
    mockSetDoc.mockReturnValueOnce(promise);
    render(<StaffPage />);

    const addBtn = screen.getAllByText('add')[0];
    fireEvent.click(addBtn);

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'Double' } });
    fireEvent.change(inputs[1], { target: { value: 'Click' } });

    const submitBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.submit(submitBtn); // premier clic
    fireEvent.submit(submitBtn); // deuxième clic rapide

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
    });

    resolvePromise!();
    await waitFor(() => {
      expect(mockUpdateLocalState).toHaveBeenCalledTimes(1);
    });
  });

  it('E. Édition avec merge: true et préservation des champs', async () => {
    mockSetDoc.mockResolvedValueOnce(undefined);
    render(<StaffPage />);

    // Click edit on the first staff 's1'
    const editBtns = screen.getAllByTestId('edit-btn-s1');
    fireEvent.click(editBtns[0]);

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(inputs[1], { target: { value: 'ModifiedName' } });

    fireEvent.submit(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
    });

    const setDocArgs = mockSetDoc.mock.calls[0];
    expect(setDocArgs[2]).toEqual({ merge: true });

    await waitFor(() => {
      expect(mockUpdateLocalState).toHaveBeenCalledTimes(1);
    });
    
    const passedDb = mockUpdateLocalState.mock.calls[0][0].staff;
    const editedStaff = passedDb.find((s: Staff) => s.id === 's1');
    expect(editedStaff).toBeDefined();
    expect(editedStaff.firstName).toBe('ModifiedName');
    expect(editedStaff.lastName).toBe('Teacher'); // preserved
  });
});

import { buildStaffWritePayload } from '../../src/utils/staffHelpers';

describe('buildStaffWritePayload', () => {
  it('teste le payload pur', () => {
    const form = {
      schoolId: 'should-be-ignored',
      firstName: '  John  ',
      lastName: ' Doe ',
      staffType: 'teacher' as const,
      legacyProp: 'should-be-ignored-too'
    };
    const currentSchool = { id: 'school-override' };
    const currentUser = { id: 'user-1' };

    const payload = buildStaffWritePayload(form, currentSchool, currentUser, false);

    expect(payload.schoolId).toBe('school-override');
    expect(payload.firstName).toBe('John'); // trimmed
    expect(payload.lastName).toBe('Doe'); // trimmed
    expect((payload as Record<string, unknown>).legacyProp).toBeUndefined(); // no legacy
    expect(payload.createdBy).toBe('user-1');
    expect(payload.createdAt).toBeDefined();
    
    // update test
    const updatePayload = buildStaffWritePayload({ employmentStatus: 'departed', departureDate: '2025-01-01' }, currentSchool, null, true);
    expect(updatePayload.updatedBy).toBeUndefined();
    expect(updatePayload.createdAt).toBeUndefined(); // no overwrite
    expect(updatePayload.employmentStatus).toBe('departed');
    expect(updatePayload.departureDate).toBe('2025-01-01');
  });
});
