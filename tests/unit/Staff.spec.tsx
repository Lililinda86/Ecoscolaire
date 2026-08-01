// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StaffPage from '../../src/pages/Staff';
import * as AppContextModule from '../../src/context/AppContext';
import * as I18nContextModule from '../../src/context/I18nContext';
import type { Staff } from '../../src/types';

describe('B. Personnel (Staff.tsx)', () => {
  const mockSafeMergeDB = vi.fn();

  const mockContextValue = {
    db: {
      staff: [
        { id: 's1', schoolId: 'school-1', firstName: 'Active', lastName: 'Teacher', staffType: 'teacher', employmentStatus: 'active', legacyProp: 'legacyValue' },
        { id: 's2', schoolId: 'school-2', firstName: 'Other', lastName: 'School', staffType: 'teacher', employmentStatus: 'active' },
        { id: 's3', schoolId: 'school-1', firstName: 'Inactive', lastName: 'Staff', staffType: 'secretary', employmentStatus: 'inactive' }
      ] as Staff[],
      classes: []
    },
    safeMergeDB: mockSafeMergeDB,
    currentSchool: { id: 'school-1', name: 'School 1' },
    isSchoolSuspended: false,
    currentUser: { id: 'u1', role: 'director', schoolId: 'school-1' }
  };

  beforeEach(() => {
    mockSafeMergeDB.mockClear();
    vi.clearAllMocks();

    vi.spyOn(AppContextModule, 'useAppContext').mockReturnValue(mockContextValue as unknown as ReturnType<typeof AppContextModule.useAppContext>);
    vi.spyOn(I18nContextModule, 'useI18n').mockReturnValue({ t: (k: string) => k, locale: 'fr', setLocale: () => {} } as unknown as ReturnType<typeof I18nContextModule.useI18n>);

    window.confirm = vi.fn().mockReturnValue(true);
  });

  it('B.1 Filtrage strict par schoolId', () => {
    render(<StaffPage />);
    expect(screen.queryByText('Teacher Active')).not.toBeNull();
    expect(screen.queryByText('School Other')).toBeNull();
  });

  it('B.2 Aucune suppression physique, désactivation logique avec debounce', async () => {
    vi.useFakeTimers();
    render(<StaffPage />);

    let resolveMock: (value: unknown) => void;
    mockSafeMergeDB.mockImplementationOnce(() => {
      return new Promise((resolve) => {
        resolveMock = resolve;
      });
    });

    const deactBtns = screen.getAllByTestId('deact-btn-s1');
    fireEvent.click(deactBtns[0]);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockSafeMergeDB).toHaveBeenCalledTimes(1);

    const passedDb = mockSafeMergeDB.mock.calls[0][0];
    const updatedStaff = passedDb.staff.find((s: Staff) => s.id === 's1');
    expect(passedDb.staff.length).toBe(3);
    expect(updatedStaff.employmentStatus).toBe('inactive');

    // Double click protection
    fireEvent.click(deactBtns[0]);
    expect(mockSafeMergeDB).toHaveBeenCalledTimes(1); // Not called again

    // Resolve the promise
    resolveMock!(undefined);

    // Fast-forward pending microtasks
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  it('B.3 SchoolId forcé à la création et protection des champs', () => {
    render(<StaffPage />);

    const addBtn = screen.getAllByRole('button').find(b => b.innerHTML.includes('lucide-plus'));
    fireEvent.click(addBtn!);

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'New' } });
    fireEvent.change(inputs[1], { target: { value: 'Person' } });

    fireEvent.submit(screen.getByRole('button', { name: /save/i }));

    expect(mockSafeMergeDB).toHaveBeenCalledTimes(1);
    const passedDb = mockSafeMergeDB.mock.calls[0][0];
    const newStaff = passedDb.staff.find((s: Staff) => s.lastName === 'New');

    expect(newStaff.schoolId).toBe('school-1');
    expect(newStaff.firstName).toBe('Person');
    expect(newStaff.staffType).toBe('teacher');
    expect(newStaff.employmentStatus).toBe('active'); // par défaut

    // Validate undefined fields are not saved
    expect(Object.keys(newStaff)).not.toContain('phone');
  });

  it('B.4 Édition par patch sans écraser les champs absents et anciennes props legacy', () => {
    render(<StaffPage />);

    // Edit s1 (Teacher Active)
    const editBtns = screen.getAllByTestId('edit-btn-s1');
    fireEvent.click(editBtns[0]); // opens modal for s1

    // Verify inputs have values
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    expect(inputs[0].value).toBe('Teacher');

    // Change first name
    fireEvent.change(inputs[1], { target: { value: 'ActiveModified' } });

    // Submit
    fireEvent.submit(screen.getByRole('button', { name: /save/i }));

    expect(mockSafeMergeDB).toHaveBeenCalledTimes(1);
    const passedDb = mockSafeMergeDB.mock.calls[0][0];
    const updatedStaff = passedDb.staff.find((s: Staff) => s.id === 's1');

    expect(updatedStaff.firstName).toBe('ActiveModified');
    expect(updatedStaff.lastName).toBe('Teacher'); // preserved
    expect(updatedStaff.legacyProp).toBe('legacyValue'); // preserved! (patch edit)
  });
});
