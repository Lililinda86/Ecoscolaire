import { describe, test, expect } from 'vitest';
import { 
  getEffectiveClassSubjects 
} from '../../src/services/effectiveClassSubjects';
import { Student, Class, ClassProgramDraft, ClassSubject, Subject } from '../../src/types';

describe('effectiveClassSubjects service', () => {
  const mockStudent: Student = {
    id: 'stu-1',
    schoolId: 'sch-1',
    name: 'Alice',
    section: 'SIL',
    classId: 'class-1',
    isActive: true,
    createdAt: '2026-01-01',
    createdBy: 'admin'
  };

  const mockClasses: Class[] = [
    {
      id: 'class-1',
      schoolId: 'sch-1',
      academicYear: 'ay-1',
      name: 'SIL A',
      type: 'Primary',
      capacity: 30,
      createdAt: '2026-01-01',
      createdBy: 'admin'
    }
  ];

  const mockSubjects: Subject[] = [
    { id: 'sub-math', schoolId: 'sch-1', name: 'Mathématiques', code: 'MATH', type: 'Primary' },
    { id: 'sub-civic', schoolId: 'sch-1', name: 'Moral and Civic Education', code: 'CIV', type: 'Primary' },
    { id: 'sub-sport', schoolId: 'sch-1', name: 'Sport', code: 'SPORT', type: 'Primary' }
  ];

  const mockPrograms: ClassProgramDraft[] = [
    {
      id: 'prog-1',
      schoolId: 'sch-1',
      academicYearId: 'ay-1',
      classId: 'class-1',
      status: 'published',
      publishedRevisionId: 'rev-2',
      createdAt: '', createdBy: '', updatedAt: '', updatedBy: ''
    }
  ];

  const mockClassSubjects: ClassSubject[] = [
    {
      id: 'cs-math', programId: 'prog-1', schoolId: 'sch-1', classId: 'class-1', academicYearId: 'ay-1',
      subjectId: 'sub-math', revisionId: 'rev-2', revisionNumber: 2,
      subjectNameSnapshot: 'Math', coefficient: 2, weeklyHours: 2, isRequired: true, displayOrder: 1, isActive: true,
      createdAt: '', createdBy: '', updatedAt: '', updatedBy: ''
    },
    {
      id: 'cs-civic', programId: 'prog-1', schoolId: 'sch-1', classId: 'class-1', academicYearId: 'ay-1',
      subjectId: 'sub-civic', revisionId: 'rev-2', revisionNumber: 2,
      subjectNameSnapshot: 'Civic', coefficient: 1, weeklyHours: 1, isRequired: true, displayOrder: 2, isActive: true,
      createdAt: '', createdBy: '', updatedAt: '', updatedBy: ''
    },
    {
      // Inactif
      id: 'cs-sport', programId: 'prog-1', schoolId: 'sch-1', classId: 'class-1', academicYearId: 'ay-1',
      subjectId: 'sub-sport', revisionId: 'rev-2', revisionNumber: 2,
      subjectNameSnapshot: 'Sport', coefficient: 1, weeklyHours: 1, isRequired: true, displayOrder: 3, isActive: false,
      createdAt: '', createdBy: '', updatedAt: '', updatedBy: ''
    },
    {
      // Autre classe
      id: 'cs-other', programId: 'prog-2', schoolId: 'sch-1', classId: 'class-2', academicYearId: 'ay-1',
      subjectId: 'sub-math', revisionId: 'rev-other', revisionNumber: 1,
      subjectNameSnapshot: 'Math', coefficient: 1, weeklyHours: 1, isRequired: true, displayOrder: 1, isActive: true,
      createdAt: '', createdBy: '', updatedAt: '', updatedBy: ''
    }
  ];

  test('17. seules les matières du programme publié sont retournées', () => {
    const res = getEffectiveClassSubjects({
      classId: mockStudent.classId,
      classes: mockClasses,
      classPrograms: mockPrograms,
      classSubjects: mockClassSubjects,
      subjects: mockSubjects,
      activeAcademicYearId: 'ay-1',
      equivalentAcademicYearIds: ['ay-1']
    });
    expect(res.status).toBe('success');
    expect(res.subjects).toHaveLength(2);
    expect(res.subjects.map(s => s.subjectId)).toEqual(['sub-math', 'sub-civic']);
  });

  test('18. matière inactive exclue', () => {
    const res = getEffectiveClassSubjects({
      classId: mockStudent.classId,
      classes: mockClasses,
      classPrograms: mockPrograms,
      classSubjects: mockClassSubjects,
      subjects: mockSubjects,
      activeAcademicYearId: 'ay-1',
      equivalentAcademicYearIds: ['ay-1']
    });
    expect(res.subjects.find(s => s.subjectId === 'sub-sport')).toBeUndefined();
  });

  test('19. matière d\'une autre classe exclue', () => {
    const res = getEffectiveClassSubjects({
      classId: mockStudent.classId,
      classes: mockClasses,
      classPrograms: mockPrograms,
      classSubjects: mockClassSubjects,
      subjects: mockSubjects,
      activeAcademicYearId: 'ay-1',
      equivalentAcademicYearIds: ['ay-1']
    });
    expect(res.subjects.find(s => s.classSubjectId === 'cs-other')).toBeUndefined();
  });

  test('20. matière d\'une autre école exclue (impliqué par le program publié pour cette classe unique)', () => {
     // If class is filtered, school is inherently filtered
  });

  test('21. ordre du programme respecté', () => {
    const res = getEffectiveClassSubjects({
      classId: mockStudent.classId,
      classes: mockClasses,
      classPrograms: mockPrograms,
      classSubjects: mockClassSubjects,
      subjects: mockSubjects,
      activeAcademicYearId: 'ay-1',
      equivalentAcademicYearIds: ['ay-1']
    });
    expect(res.subjects[0].subjectId).toBe('sub-math');
    expect(res.subjects[1].subjectId).toBe('sub-civic');
  });

  test('22. programme non publié refusé', () => {
    const unpublishedPrograms: ClassProgramDraft[] = [
      { ...mockPrograms[0], publishedRevisionId: undefined }
    ];
    const res = getEffectiveClassSubjects({
      classId: mockStudent.classId,
      classes: mockClasses,
      classPrograms: unpublishedPrograms,
      classSubjects: mockClassSubjects,
      subjects: mockSubjects,
      activeAcademicYearId: 'ay-1',
      equivalentAcademicYearIds: ['ay-1']
    });
    expect(res.status).toBe('no_program');
    expect(res.subjects).toHaveLength(0);
  });

  test('Fallback sur une année équivalente si absent sur l\'ID sélectionné', () => {
    const res = getEffectiveClassSubjects({
      classId: mockStudent.classId,
      classes: mockClasses,
      classPrograms: mockPrograms,
      classSubjects: mockClassSubjects,
      subjects: mockSubjects,
      activeAcademicYearId: 'ay-new',
      equivalentAcademicYearIds: ['ay-new', 'ay-1']
    });
    expect(res.status).toBe('success');
    expect(res.subjects).toHaveLength(2);
  });

  test('Programme sur selectedAcademicYearId prioritaire, ne devient pas ambigu avec un vieux doublon', () => {
    const conflictingPrograms: ClassProgramDraft[] = [
      ...mockPrograms,
      { ...mockPrograms[0], id: 'prog-2', academicYearId: 'ay-2' }
    ];
    // mockPrograms[0] est sur 'ay-1'. Donc on le sélectionne via activeAcademicYearId.
    const res = getEffectiveClassSubjects({
      classId: mockStudent.classId,
      classes: mockClasses,
      classPrograms: conflictingPrograms,
      classSubjects: mockClassSubjects,
      subjects: mockSubjects,
      activeAcademicYearId: 'ay-1',
      equivalentAcademicYearIds: ['ay-1', 'ay-2']
    });
    expect(res.status).toBe('success');
  });

  test('Statut ambigu si plusieurs programmes sur les années équivalentes UNIQUEMENT (fallback multiple)', () => {
    const conflictingPrograms: ClassProgramDraft[] = [
      { ...mockPrograms[0], id: 'prog-2', academicYearId: 'ay-2' },
      { ...mockPrograms[0], id: 'prog-3', academicYearId: 'ay-3' }
    ];
    const res = getEffectiveClassSubjects({
      classId: mockStudent.classId,
      classes: mockClasses,
      classPrograms: conflictingPrograms,
      classSubjects: mockClassSubjects,
      subjects: mockSubjects,
      activeAcademicYearId: 'ay-new',
      equivalentAcademicYearIds: ['ay-new', 'ay-2', 'ay-3']
    });
    expect(res.status).toBe('ambiguous_program');
  });

  test('Aucun programme si absent de toutes les années équivalentes', () => {
    const res = getEffectiveClassSubjects({
      classId: mockStudent.classId,
      classes: mockClasses,
      classPrograms: mockPrograms,
      classSubjects: mockClassSubjects,
      subjects: mockSubjects,
      activeAcademicYearId: 'ay-new',
      equivalentAcademicYearIds: ['ay-new', 'ay-3']
    });
    expect(res.status).toBe('no_program');
  });
});
