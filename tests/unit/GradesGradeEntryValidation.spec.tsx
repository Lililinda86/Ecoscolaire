/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import Grades from '../../src/pages/Grades';
import { AppProvider } from '../../src/context/AppContext';

// Mock structured grades save
const mockSaveStructuredGrades = vi.fn().mockResolvedValue(undefined);

// Provide alert mock
global.alert = vi.fn();

const mockUser = { id: 'u1', role: 'director' };
const mockSchool = { id: 'sch1', name: 'Ecole 1' };
const mockAcademicYear = { id: 'ay1', schoolId: 'sch1', name: '2026-2027', startDate: '2026-01-01', endDate: '2026-12-31', status: 'published' };
const mockPeriod = { id: 'p1', schoolId: 'sch1', academicYearId: 'ay1', name: 'Trim 1', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open' };
const mockClass = { id: 'c1', schoolId: 'sch1', name: 'CE1', status: 'active' };
const mockSubject = { id: 'sub1', name: 'Maths' };
const mockClassSubject = { id: 'cs1', classId: 'c1', subjectId: 'sub1', status: 'active', programId: 'prog1' };
const mockProgram = { id: 'prog1', classId: 'c1', academicYearId: 'ay1', status: 'published' };
const mockAssignment = { id: 'ass1', schoolId: 'sch1', academicYearId: 'ay1', classId: 'c1', sourceClassSubjectId: 'cs1', teacherStaffId: 'u1', isActive: true };

const mockStudents = [
  { id: 'st1', schoolId: 'sch1', classId: 'c1', name: 'Alice', schoolingStatus: 'active' }, // Empty field initially
  { id: 'st2', schoolId: 'sch1', classId: 'c1', name: 'Bob', schoolingStatus: 'active' }, // Will test explicit 0
  { id: 'st3', schoolId: 'sch1', classId: 'c1', name: 'Charlie', schoolingStatus: 'active' }, // Will test 11.25
  { id: 'st4', schoolId: 'sch1', classId: 'c1', name: 'David', schoolingStatus: 'active' }, // Will test existing absent
  { id: 'st5', schoolId: 'sch1', classId: 'c1', name: 'Eve', schoolingStatus: 'active' }, // Will test existing exempted
  { id: 'st6', schoolId: 'sch2', classId: 'c2', name: 'OtherSchool', schoolingStatus: 'active' }, // Should not be modified
];

const mockGrades = [
  // Existing scored grade for Alice
  { id: 'g0', evaluationId: 'eval1', studentId: 'st1', resultStatus: 'scored', score: 15, version: 1 },
  // Existing absent grade
  { id: 'g1', evaluationId: 'eval1', studentId: 'st4', resultStatus: 'absent', version: 1 },
  // Existing exempted grade
  { id: 'g2', evaluationId: 'eval1', studentId: 'st5', resultStatus: 'exempt', version: 1 },
];

const mockEvaluations = [
  { id: 'eval1', schoolId: 'sch1', academicYearId: 'ay1', periodId: 'p1', classSubjectId: 'cs1', title: 'Eval 1', type: 'exam', maxScore: 20, weight: 1, date: '2026-10-01' }
];

const mockDb = {
  academicYears: [mockAcademicYear],
  periods: [mockPeriod],
  classes: [mockClass],
  subjects: [mockSubject],
  classSubjects: [mockClassSubject],
  classPrograms: [mockProgram],
  teacherAssignments: [mockAssignment],
  students: mockStudents,
  grades: mockGrades,
  evaluations: mockEvaluations,
};

vi.mock('../../src/context/I18nContext', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../src/services/effectiveClassSubjects', () => ({
  getEffectiveClassSubjects: vi.fn().mockReturnValue({
    status: 'success',
    classSubjects: [{ id: 'cs1', subjectId: 'sub1' }],
    subjects: [{ classSubjectId: 'cs1', subjectId: 'sub1', name: 'Maths', order: 1 }]
  }),
}));

vi.mock('../../src/utils/academicYearDeduplication', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deduplicateAcademicYears: (years: any) => years,
  getEquivalentAcademicYearIds: () => ['ay1'],
}));

vi.mock('../../src/utils/academicState', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAcademicState: (years: any[], periods: any[]) => ({
    activeYear: years[0],
    activePeriods: periods,
  }),
}));

vi.mock('../../src/context/AppContext', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AppProvider: ({ children }: any) => <div>{children}</div>,
    useAppContext: () => ({
      db: mockDb,
      currentUser: mockUser,
      currentSchool: mockSchool,
      saveStructuredGrades: mockSaveStructuredGrades,
    }),
    useAppDb: () => mockDb,
    useAuth: () => ({ currentUser: mockUser, currentSchool: mockSchool }),
  };
});

describe('Grades - Grade Entry Validation', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const setupAndOpenExistingEval = async () => {
    render(
      <AppProvider>
        <Grades />
      </AppProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /Saisir des notes/i }));

    const modalHeading = screen.getByText('Saisie des Notes');
    const modal = modalHeading.parentElement?.parentElement;
    if (!modal) throw new Error("Modal not found");

    // selects[0] is Année Scolaire
    fireEvent.change(within(modal).getAllByRole('combobox')[0], { target: { value: 'ay1' } });

    // wait for Période options
    await waitFor(() => {
      const periodeSelect = within(modal).getAllByRole('combobox')[1] as HTMLSelectElement;
      expect(periodeSelect.options.length).toBeGreaterThan(1);
    });

    // selects[1] is Période
    fireEvent.change(within(modal).getAllByRole('combobox')[1], { target: { value: 'p1' } });

    // selects[2] is Classe
    await waitFor(() => {
      expect(within(modal).getAllByRole('combobox').length).toBeGreaterThanOrEqual(3);
    });
    fireEvent.change(within(modal).getAllByRole('combobox')[2], { target: { value: 'c1' } });

    // selects[3] is Matière
    await waitFor(() => {
      expect(within(modal).getAllByRole('combobox').length).toBeGreaterThanOrEqual(4);
    });
    fireEvent.change(within(modal).getAllByRole('combobox')[3], { target: { value: 'cs1' } });

    // Choose existing evaluation
    fireEvent.click(screen.getByLabelText(/Existante/));
    await waitFor(() => {
      expect(within(modal).getAllByRole('combobox').length).toBeGreaterThanOrEqual(5);
    });
    fireEvent.change(within(modal).getAllByRole('combobox')[4], { target: { value: 'eval1' } });
  };

  const setupAndOpenNewEval = async () => {
    render(
      <AppProvider>
        <Grades />
      </AppProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /Saisir des notes/i }));

    const modalHeading = screen.getByText('Saisie des Notes');
    const modal = modalHeading.parentElement?.parentElement;
    if (!modal) throw new Error("Modal not found");

    fireEvent.change(within(modal).getAllByRole('combobox')[0], { target: { value: 'ay1' } });

    await waitFor(() => {
      const periodeSelect = within(modal).getAllByRole('combobox')[1] as HTMLSelectElement;
      expect(periodeSelect.options.length).toBeGreaterThan(1);
    });

    fireEvent.change(within(modal).getAllByRole('combobox')[1], { target: { value: 'p1' } });

    await waitFor(() => {
      expect(within(modal).getAllByRole('combobox').length).toBeGreaterThanOrEqual(3);
    });
    fireEvent.change(within(modal).getAllByRole('combobox')[2], { target: { value: 'c1' } });

    await waitFor(() => {
      expect(within(modal).getAllByRole('combobox').length).toBeGreaterThanOrEqual(4);
    });
    fireEvent.change(within(modal).getAllByRole('combobox')[3], { target: { value: 'cs1' } });

    fireEvent.click(screen.getByLabelText(/Nouvelle/));
  };

  it('displays correct visual status based on empty or existing values', async () => {
    await setupAndOpenExistingEval();

    // st1 (Alice) has scored -> Noté
    // st2 (Bob) has no grade -> Non noté
    // st3 (Charlie) has no grade -> Non noté
    // st4 (David) has absent -> Absent
    // st5 (Eve) has exempt -> Dispensé

    expect(screen.getAllByText('Non noté')).toHaveLength(2);
    expect(screen.getByText('Noté')).not.toBeNull();
    expect(screen.getByText('Absent')).not.toBeNull();
    expect(screen.getByText('Dispensé')).not.toBeNull();
  });

  it('handles explicit 0 and decimals, preserves empty, rejects invalid', async () => {
    await setupAndOpenExistingEval();

    const inputs = screen.getAllByPlaceholderText('Note');
    expect(inputs).toHaveLength(5); // 5 students in class c1

    // Alice (st1): empty -> leave as is
    // Bob (st2): explicit 0
    fireEvent.change(inputs[1], { target: { value: '0' } });

    // Charlie (st3): 11.25
    fireEvent.change(inputs[2], { target: { value: '11.25' } });

    // Check visual status updates for those who have a note typed
    expect(screen.getAllByText('Noté')).toHaveLength(3);

    // Trigger save
    fireEvent.click(screen.getByText('Enregistrer les notes'));

    // Await promise if needed, but since button triggers sync handler which awaits save
    // We can just check mock
    expect(mockSaveStructuredGrades).toHaveBeenCalledTimes(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = (mockSaveStructuredGrades as any).mock.calls[0][0];
    const grades = payload.grades;

    expect(grades).toHaveLength(4);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bobGrade = grades.find((g: any) => g.studentId === 'st2');
    expect(bobGrade.score).toBe(0);
    expect(bobGrade.resultStatus).toBe('scored');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const charlieGrade = grades.find((g: any) => g.studentId === 'st3');
    expect(charlieGrade.score).toBe(11.25);
    expect(charlieGrade.resultStatus).toBe('scored');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const davidGrade = grades.find((g: any) => g.studentId === 'st4');
    expect(davidGrade.score).toBeUndefined();
    expect(davidGrade.resultStatus).toBe('absent');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eveGrade = grades.find((g: any) => g.studentId === 'st5');
    expect(eveGrade.score).toBeUndefined();
    expect(eveGrade.resultStatus).toBe('exempt');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aliceGrade = grades.find((g: any) => g.studentId === 'st1');
    expect(aliceGrade).toBeUndefined(); // Existing scored grade is NOT included in writes since input remained empty/unchanged

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const otherGrade = grades.find((g: any) => g.studentId === 'st6');
    expect(otherGrade).toBeUndefined(); // Other school student never modified
  });

  it('rejects negative and over maximum notes', async () => {
    await setupAndOpenExistingEval();
    const inputs = screen.getAllByPlaceholderText('Note');

    // Negative
    fireEvent.change(inputs[0], { target: { value: '-2' } });

    const modalHeading = screen.getByText('Saisie des Notes');
    const modal = modalHeading.parentElement?.parentElement;
    fireEvent.submit(modal!.querySelector('form')!);

    expect(global.alert).toHaveBeenCalledWith('La note doit être comprise entre 0 et 20.');
    expect(mockSaveStructuredGrades).not.toHaveBeenCalled();

    // Over max
    fireEvent.change(inputs[0], { target: { value: '25' } });
    fireEvent.submit(modal!.querySelector('form')!);
    expect(global.alert).toHaveBeenCalledWith('La note doit être comprise entre 0 et 20.');
  });

  it('blocks save button if new evaluation fields are invalid', async () => {
    await setupAndOpenNewEval();

    const saveButton = screen.getByText('Enregistrer les notes') as HTMLButtonElement;

    const modalHeading = screen.getByText('Saisie des Notes');
    const modal = modalHeading.parentElement?.parentElement;
    if (!modal) throw new Error("Modal not found");

    // Initially disabled (title is empty)
    expect(saveButton.disabled).toBe(true);

    const textInputs = Array.from(modal.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    const titleInput = textInputs[0];

    // Set title with spaces
    fireEvent.change(titleInput, { target: { value: '   ' } });
    expect(saveButton.disabled).toBe(true);

    // Valid title
    fireEvent.change(titleInput, { target: { value: 'Test Eval' } });
    expect(saveButton.disabled).toBe(false);

    const typeSelect = within(modal).getAllByRole('combobox')[4];
    fireEvent.change(typeSelect, { target: { value: 'exam' } });

    // Valid date inside period
    const dateInput = modal.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-10-15' } });

    // Disable if coeff is 0
    const numberInputs = Array.from(modal.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    const maxScoreInput = numberInputs[0];
    const coeffInput = numberInputs[1];

    fireEvent.change(coeffInput, { target: { value: '0' } });
    expect(saveButton.disabled).toBe(true);
    fireEvent.change(coeffInput, { target: { value: '1' } });

    // Disable if barème is 0
    fireEvent.change(maxScoreInput, { target: { value: '0' } });
    expect(saveButton.disabled).toBe(true);
    fireEvent.change(maxScoreInput, { target: { value: '20' } });

    // All valid
    expect(saveButton.disabled).toBe(false);

    // Out of period date
    fireEvent.change(dateInput, { target: { value: '2027-01-01' } });
    expect(saveButton.disabled).toBe(true);
  });

  it('blocks direct submission with empty title in handleSaveBulk', async () => {
    await setupAndOpenNewEval();

    const modalHeading = screen.getByText('Saisie des Notes');
    const modal = modalHeading.parentElement?.parentElement;
    if (!modal) throw new Error("Modal not found");

    const form = modal.querySelector('form');
    // Ensure title is empty (spaces)
    const titleInput = modal.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: '   ' } });

    // Submit directly bypassing button disabled state
    fireEvent.submit(form!);

    expect(global.alert).toHaveBeenCalledWith("Le titre de l'évaluation est obligatoire.");
    expect(mockSaveStructuredGrades).not.toHaveBeenCalled();
  });

  it('blocks direct submission with out of period date in handleSaveBulk', async () => {
    await setupAndOpenNewEval();
    const modalHeading = screen.getByText('Saisie des Notes');
    const modal = modalHeading.parentElement?.parentElement;

    // Set valid title
    const titleInput = modal!.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Test' } });

    const dateInput = modal!.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2027-01-01' } }); // Out of bounds

    fireEvent.submit(modal!.querySelector('form')!);
    expect(global.alert).toHaveBeenCalledWith("La date de l'évaluation doit être comprise dans la période sélectionnée.");
    expect(mockSaveStructuredGrades).not.toHaveBeenCalled();
  });

  it('blocks direct submission with zero coefficient or maxScore in handleSaveBulk', async () => {
    await setupAndOpenNewEval();
    const modalHeading = screen.getByText('Saisie des Notes');
    const modal = modalHeading.parentElement?.parentElement;

    const titleInput = modal!.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Test' } });

    const numberInputs = Array.from(modal!.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    const maxScoreInput = numberInputs[0];
    const coeffInput = numberInputs[1];

    fireEvent.change(coeffInput, { target: { value: '0' } });
    fireEvent.submit(modal!.querySelector('form')!);
    expect(global.alert).toHaveBeenCalledWith("Le coefficient doit être strictement positif.");
    expect(mockSaveStructuredGrades).not.toHaveBeenCalled();

    // Fix coeff, break maxScore
    fireEvent.change(coeffInput, { target: { value: '1' } });
    fireEvent.change(maxScoreInput, { target: { value: '0' } });
    fireEvent.submit(modal!.querySelector('form')!);
    expect(global.alert).toHaveBeenCalledWith("Le barème doit être strictement positif.");
    expect(mockSaveStructuredGrades).not.toHaveBeenCalled();
  });

  it('prevents partial writes: one valid and one invalid line produces zero writes', async () => {
    await setupAndOpenExistingEval();

    const inputs = screen.getAllByPlaceholderText('Note');

    // valid
    fireEvent.change(inputs[1], { target: { value: '10' } });
    // invalid (over max)
    fireEvent.change(inputs[2], { target: { value: '25' } });

    const modalHeading = screen.getByText('Saisie des Notes');
    const modal = modalHeading.parentElement?.parentElement;
    fireEvent.submit(modal!.querySelector('form')!);

    expect(global.alert).toHaveBeenCalledWith('La note doit être comprise entre 0 et 20.');
    expect(mockSaveStructuredGrades).not.toHaveBeenCalled();
  });
});
