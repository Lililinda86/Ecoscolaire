/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SchoolFeeCatalog } from '../../src/components/Settings/SchoolFeeCatalog';
const mocks = vi.hoisted(() => ({ save: vi.fn(async () => ({ data: {} })) }));
vi.mock('../../src/db/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_: unknown, name: string) => name === 'manageSchoolFee' ? mocks.save : async () => ({ data: { fees: [
  { id: 'ms-fee', label: 'Sortie MS facultative', category: 'excursion', amount: 2000, mandatory: false, active: true, schemaVersion: 2, academicYear: '2026-2027', cycles: ['nursery'], classIds: ['ms'] },
  { id: 'old-fee', label: 'Ancien frais facultatif', category: 'excursion', amount: 2000, mandatory: false, active: true, schemaVersion: 2, academicYear: '2025-2026' }
] } }) }));
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({ currentUser: { role: 'director' }, db: {
  school: { id: 'school', academicYear: '2026-2027', activeAcademicYearId: 'year' },
  classes: [{ id: 'ms', schoolId: 'school', name: 'Maternelle Moyenne Section', cycle: 'nursery' }, { id: 'cp', schoolId: 'school', name: 'CP', cycle: 'primary' }],
  students: [
    { id: 'ms-student', name: 'Alice MS', matricule: 'MS-1', schoolId: 'school', academicYearId: 'year', classId: 'ms' },
    { id: 'cp-student', name: 'Benoit CP', matricule: 'CP-1', schoolId: 'school', academicYearId: 'year', classId: 'cp' },
    { id: 'inactive', name: 'Inactive MS', schoolId: 'school', academicYearId: 'year', classId: 'ms', schoolingStatus: 'inactive' }
  ]
} }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('assigns an optional fee explicitly through the accessible controls and only offers eligible students', async () => {
  render(<SchoolFeeCatalog />);
  const fee = await screen.findByRole('combobox', { name: 'Frais facultatif', exact: true });
  await waitFor(() => expect(within(fee).getAllByRole('option')).toHaveLength(2));
  fireEvent.change(fee, { target: { value: 'ms-fee' } });
  const student = screen.getByRole('combobox', { name: 'Élève concerné', exact: true });
  expect(within(student).getAllByRole('option')).toHaveLength(2);
  expect(within(student).getByRole('option', { name: 'Alice MS — MS-1' })).toBeTruthy();
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.change(student, { target: { value: 'ms-student' } });
  fireEvent.click(screen.getByRole('button', { name: 'Affecter à l’élève', exact: true }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ schoolId: 'school', action: 'assign', feeId: 'ms-fee', studentId: 'ms-student' }));
});
