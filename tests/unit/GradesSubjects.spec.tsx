/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock Modal since Grades uses it and might cause issues if not mocked
vi.mock('../../src/components/Modal', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ isOpen, children }: any) => isOpen ? <div data-testid="modal">{children}</div> : null
}));

// We will mock useAppContext by wrapping the component in a mocked provider context, or mock the hook directly.
// Since Grades imports from AppContext, we can mock the module.
vi.mock('../../src/context/AppContext', () => ({
  useAppContext: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AppProvider: ({ children }: any) => <div>{children}</div>
}));

vi.mock('../../src/context/I18nContext', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  I18nProvider: ({ children }: any) => <div>{children}</div>
}));

import { useAppContext } from '../../src/context/AppContext';
import Grades from '../../src/pages/Grades';

const mockSchool = { id: 's1', name: 'Ecole 1' };
const mockUser = { uid: 'u1', role: 'teacher' };
const mockAcademicYears = [{ id: 'ay1', schoolId: 's1', name: '2026-2027', status: 'active' }];
const mockPeriods = [{ id: 'p1', schoolId: 's1', academicYearId: 'ay1', name: 'Trimestre 1', status: 'open' }];
const mockSubjects = [
  { id: 'sub1', schoolId: 's1', name: 'Maths' },
  { id: 'sub2', schoolId: 's1', name: 'Français' }
];

describe('Grades - Filtrage des matières', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setupTest = (customDb: any = {}) => {
    const defaultMockClasses = [
      { id: 'c1', schoolId: 's1', name: 'CE1', type: 'francophone' },
      { id: 'c2', schoolId: 's1', name: 'CM1', type: 'francophone' },
      { id: 'c3', schoolId: 's1', name: 'CM2', type: 'francophone' }
    ];

    const mockDb = {
      classes: defaultMockClasses,
      academicYears: mockAcademicYears,
      periods: mockPeriods,
      subjects: mockSubjects,
      students: [],
      ...customDb
    };
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useAppContext as any).mockReturnValue({
      db: mockDb,
      currentUser: mockUser,
      currentSchool: mockSchool,
      firestoreError: customDb.firestoreError || null
    });

    return render(<Grades />);
  };

  it('affiche les matières du programme publié de la classe', async () => {
    const user = userEvent.setup();
    const customDb = {
      classPrograms: [
        { id: 'p1', schoolId: 's1', classId: 'c1', academicYearId: 'ay1', status: 'published', publishedRevisionId: 'rev1' },
        { id: 'p3', schoolId: 's1', classId: 'c3', academicYearId: 'ay1', status: 'published', publishedRevisionId: 'rev3' }
      ],
      classSubjects: [
        { id: 'cs1', schoolId: 's1', classId: 'c1', revisionId: 'rev1', subjectId: 'sub1', isActive: true, coefficient: 2, displayOrder: 1 },
        { id: 'cs2', schoolId: 's1', classId: 'c1', revisionId: 'rev1', subjectId: 'sub2', isActive: true, coefficient: 3, displayOrder: 2 },
        // Subject absent from catalog
        { id: 'cs_missing', schoolId: 's1', classId: 'c1', revisionId: 'rev1', subjectId: 'sub999', isActive: true, coefficient: 1, displayOrder: 3 },
        // Inactive subject
        { id: 'cs3', schoolId: 's1', classId: 'c1', revisionId: 'rev1', subjectId: 'sub3', isActive: false, coefficient: 1, displayOrder: 4 },
        // Draft revision
        { id: 'cs4', schoolId: 's1', classId: 'c1', revisionId: 'draft-rev', subjectId: 'sub4', isActive: true, coefficient: 1, displayOrder: 4 },
        // Other class
        { id: 'cs5', schoolId: 's1', classId: 'c2', revisionId: 'rev2', subjectId: 'sub1', isActive: true, coefficient: 2, displayOrder: 1 },
        // c3 has no active subjects
        { id: 'cs6', schoolId: 's1', classId: 'c3', revisionId: 'rev3', subjectId: 'sub1', isActive: false, coefficient: 2, displayOrder: 1 },
      ]
    };
    
    setupTest(customDb);
    
    // Find "Saisir des Notes" button and click it to open modal
    const addButton = screen.getByText(/Saisir des Notes/i);
    await user.click(addButton);

    const modal = screen.getByTestId('modal');

    // Select Academic Year
    const yearSelect = modal.querySelectorAll('select')[0];
    await user.selectOptions(yearSelect, 'ay1');
    
    // Select Period
    const periodSelect = modal.querySelectorAll('select')[1];
    await user.selectOptions(periodSelect, 'p1');

    // Select Class (c1)
    const classSelect = modal.querySelectorAll('select')[2];
    await user.selectOptions(classSelect, 'c1');

    // The Subject select should now be visible and contain Maths and Français
    const subjectSelect = modal.querySelectorAll('select')[3];
    expect(subjectSelect).not.toBeNull();
    
    // Option length should be 4: "-- Choisir --", "Maths (Coeff 2)", "Français (Coeff 3)", "Inconnu (Coeff 1)"
    const options = Array.from(subjectSelect.querySelectorAll('option'));
    expect(options).toHaveLength(4);
    expect(options[1].textContent).toContain('Maths');
    expect(options[2].textContent).toContain('Français');
    expect(options[3].textContent).toContain('Inconnu');

    // Change class to c2 (which has no published program)
    await user.selectOptions(classSelect, 'c2');
    
    // Should see "Le programme de cette classe n’est pas encore publié."
    expect(screen.getByText(/Le programme de cette classe n’est pas encore publié/i)).not.toBeNull();
    
    // Test empty program
    await user.selectOptions(classSelect, 'c3');
    expect(screen.getByText(/Aucune matière active dans le programme publié/i)).not.toBeNull();
  });
});
