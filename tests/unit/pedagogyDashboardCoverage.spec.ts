import { expect, it } from 'vitest';
import { dashboardAssessmentCoverage } from '../../src/features/pedagogy/services/dashboardCoverage';
it('uses unique configured numeric classes in the exact school/year/week', () => {
  const classes = [
    { id: 'a', schoolId: 'school-a', name: 'CE1' }, { id: 'b', schoolId: 'school-a', name: 'Form 1' },
    { id: 'pre', schoolId: 'school-a', name: 'Prématernelle' }, { id: 'nursery', schoolId: 'school-a', name: 'Nursery' },
    { id: 'unknown', schoolId: 'school-a', name: 'Unclassified' }, { id: 'foreign', schoolId: 'school-b', name: 'CE1' },
    { id: 'inactive', schoolId: 'school-a', name: 'CE1', isActive: false },
  ];
  const assessment = { classId: 'a', schoolId: 'school-a', academicYearId: 'year-a', weekId: 'week-a', status: 'needs_review' };
  expect(dashboardAssessmentCoverage(classes, [assessment, assessment, { ...assessment, classId: 'b', status: 'archived' }, { ...assessment, classId: 'b', schoolId: 'school-b' }, { ...assessment, classId: 'b', academicYearId: 'old-year' }, { ...assessment, classId: 'b', weekId: 'old-week' }], 'school-a', 'year-a', 'week-a')).toEqual({ configuredNumericClasses: 2, classesWithAssessment: 1, classesWithoutAssessment: 1 });
});
it('does not use another school as a fallback denominator', () => {
  expect(dashboardAssessmentCoverage([{ id: 'a', schoolId: 'school-a', name: 'CE1' }], [], 'school-b', 'year-b', 'week-b')).toEqual({ configuredNumericClasses: 0, classesWithAssessment: 0, classesWithoutAssessment: 0 });
});
