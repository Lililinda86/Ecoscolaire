/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SchoolFeeCatalog } from '../../src/components/Settings/SchoolFeeCatalog';
const mocks = vi.hoisted(() => ({ save: vi.fn(async () => ({ data: {} })) }));
vi.mock('../../src/db/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_: unknown, name: string) => name === 'manageSchoolFee' ? mocks.save : async () => ({ data: { fees: [] } }) }));
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({ currentUser: { role: 'director' }, db: {
  school: { id: 'school', academicYear: '2026-2027', activeAcademicYearId: 'year' },
  classes: [
    { id: 'ps', schoolId: 'school', name: 'Maternelle 1', cycle: 'preschool' },
    { id: 'ms', schoolId: 'school', name: 'Maternelle Moyenne Section' },
    { id: 'gs', schoolId: 'school', name: 'Maternelle Grande Section', cycle: 'nursery' },
    { id: 'en', schoolId: 'school', name: 'Nursery 2', cycle: 'nursery' },
    { id: 'cp', schoolId: 'school', name: 'CP', cycle: 'primary' },
    { id: 'f1', schoolId: 'school', name: 'Form 1', cycle: 'secondary' },
    { id: 'old', schoolId: 'school', name: 'Classe inactive', cycle: 'nursery', isActive: false },
    { id: 'foreign', schoolId: 'foreign', name: 'Classe étrangère', cycle: 'nursery' },
    { id: 'last', schoolId: 'school', name: 'Ancienne année', cycle: 'nursery', academicYearId: 'old' }
  ],
  students: [
    { id: 'a', name: 'Élise Alice', matricule: 'AF-001', schoolId: 'school', academicYearId: 'year', classId: 'ps' },
    { id: 'a', name: 'Élise Alice', matricule: 'AF-001', schoolId: 'school', academicYearId: 'year', classId: 'ps' },
    { id: 'b', name: 'Benoît', matricule: 'AF-002', schoolId: 'school', academicYearId: 'year', classId: 'cp' },
    { id: 'c', name: 'Inactif', schoolId: 'school', academicYearId: 'year', classId: 'ps', schoolingStatus: 'inactive' },
    { id: 'd', name: 'Autre école', schoolId: 'foreign', academicYearId: 'year', classId: 'ps' },
    { id: 'e', name: 'Ancien élève', schoolId: 'school', academicYearId: 'old', classId: 'ps' }
  ]
} }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('cascades real active cycles/classes/students, prunes stale selections, and reviews exact publication', async () => {
  render(<SchoolFeeCatalog />);
  fireEvent.click(screen.getByText('Créer un nouveau frais'));
  const classes = () => within(screen.getByRole('group', { name: 'Classes concernées' }));
  const students = () => within(screen.getByRole('group', { name: 'Élèves concernés' }));
  expect(classes().getAllByRole('checkbox')).toHaveLength(7);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Maternelle', exact: true }));
  expect(classes().getAllByRole('checkbox')).toHaveLength(5);
  expect(classes().queryByLabelText('Maternelle 1')).toBeNull();
  expect(classes().queryByLabelText('CP')).toBeNull();
  fireEvent.click(classes().getByLabelText('Maternelle Petite Section'));
  expect(students().getAllByRole('checkbox')).toHaveLength(2);
  fireEvent.click(students().getByLabelText('Élise Alice — AF-001'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Primaire', exact: true }));
  expect(classes().getAllByRole('checkbox')).toHaveLength(6);
  fireEvent.click(classes().getByLabelText('CP'));
  expect(students().getAllByRole('checkbox')).toHaveLength(3);
  fireEvent.change(students().getByRole('searchbox'), { target: { value: 'AF-002' } });
  expect(students().queryByLabelText('Élise Alice — AF-001')).toBeNull();
  expect(students().getByLabelText('Benoît — AF-002')).toBeTruthy();
  fireEvent.change(students().getByRole('searchbox'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Maternelle', exact: true }));
  expect(classes().queryByLabelText('Maternelle Petite Section')).toBeNull();
  expect(students().getByText('0 élèves sélectionnés')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Secondaire', exact: true }));
  expect(classes().getByLabelText('Form 1')).toBeTruthy();
  expect(classes().getAllByRole('checkbox')).toHaveLength(3);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Secondaire', exact: true }));
  fireEvent.change(screen.getByLabelText('Type de frais'), { target: { value: 'other' } });
  fireEvent.change(screen.getByLabelText('Précisez le libellé du frais'), { target: { value: 'Excursion Kribi' } });
  fireEvent.change(screen.getByLabelText('Montant (FCFA)'), { target: { value: '7500' } });
  fireEvent.click(screen.getByLabelText('Obligatoire pour les élèves concernés'));
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier avant publication' }));
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByRole('region', { name: 'Résumé avant publication' }).textContent).toContain('Élèves concernés : 1');
  fireEvent.click(screen.getByRole('button', { name: 'Publier le frais' }));
  await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ schoolId: 'school', action: 'create', fee: expect.objectContaining({ label: 'Excursion Kribi', classIds: ['cp'], cycles: ['primary'], studentIds: [], mandatory: false, amount: 7500, recurrence: 'one_off' }) })));
});

it('treats each empty selection as all eligible records and keeps search independent of scope', async () => {
  render(<SchoolFeeCatalog />);
  fireEvent.click(screen.getByText('Créer un nouveau frais'));
  const classes = within(screen.getByRole('group', { name: 'Classes concernées' }));
  const students = within(screen.getByRole('group', { name: 'Élèves concernés' }));
  expect(classes.getAllByRole('checkbox')).toHaveLength(7);
  expect(students.getAllByRole('checkbox')).toHaveLength(3);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Maternelle', exact: true }));
  expect(classes.getAllByRole('checkbox')).toHaveLength(5);
  expect(students.getAllByRole('checkbox')).toHaveLength(2);
  fireEvent.click(classes.getByLabelText('Maternelle Petite Section'));
  fireEvent.click(students.getByLabelText('Élise Alice — AF-001'));
  fireEvent.click(screen.getByRole('button', { name: 'Tout désélectionner — classes' }));
  expect((students.getByLabelText('Élise Alice — AF-001') as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Tout désélectionner — cycles' }));
  expect(classes.getAllByRole('checkbox')).toHaveLength(7);
  expect(students.getAllByRole('checkbox')).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Tout sélectionner — cycles' }));
  expect((screen.getByRole('checkbox', { name: 'Secondaire', exact: true }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Tout désélectionner — cycles' }));
  fireEvent.click(classes.getByLabelText('Tout sélectionner — classes'));
  fireEvent.click(screen.getByRole('button', { name: 'Tout désélectionner — classes' }));
  fireEvent.click(students.getByLabelText('Tout sélectionner — élèves'));
  fireEvent.click(screen.getByRole('button', { name: 'Tout désélectionner — élèves' }));
  fireEvent.change(classes.getByRole('searchbox'), { target: { value: 'moyenne' } });
  expect(classes.getAllByRole('checkbox')).toHaveLength(2);
  expect(students.getAllByRole('checkbox')).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('Libellé précis du frais'), { target: { value: 'Frais pour tous' } });
  fireEvent.change(screen.getByLabelText('Montant (FCFA)'), { target: { value: '1000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier avant publication' }));
  const review = screen.getByRole('region', { name: 'Résumé avant publication' });
  expect(review.textContent).toContain('Tous les cycles éligibles');
  expect(review.textContent).toContain('Élèves concernés : 2');
  expect(review.textContent).toContain('CP');
  fireEvent.click(screen.getByRole('button', { name: 'Publier le frais' }));
  await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ fee: expect.objectContaining({ cycles: [], classIds: [], studentIds: [], mandatory: true }) })));
});
