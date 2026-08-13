import { describe, expect, it } from 'vitest';
import type { AcademicYear, School } from '../../src/types';
import { resolveStudentEnrollmentAcademicYear } from '../../src/utils/studentEnrollment';

const school = {
  id: 'school-a',
  activeAcademicYearId: 'year-active'
} as School;

const years = [
  {
    id: 'year-active',
    schoolId: 'school-a',
    name: '2026-2027',
    status: 'active'
  },
  {
    id: 'year-other-school',
    schoolId: 'school-b',
    name: '2026-2027',
    status: 'active'
  }
] as AcademicYear[];

describe('resolveStudentEnrollmentAcademicYear', () => {
  it('uses the active year referenced by the school', () => {
    expect(resolveStudentEnrollmentAcademicYear(years, school)?.id).toBe('year-active');
  });

  it('rejects a pointer to an inactive year', () => {
    const inactiveYears = years.map(year =>
      year.id === 'year-active' ? { ...year, status: 'closed' as const } : year
    );
    expect(resolveStudentEnrollmentAcademicYear(inactiveYears, school)).toBeNull();
  });

  it('accepts exactly one active same-school year for a legacy school without a pointer', () => {
    expect(resolveStudentEnrollmentAcademicYear(years, { id: 'school-a' })).toEqual(years[0]);
  });

  it('rejects an ambiguous legacy school with multiple active years', () => {
    const ambiguous = [
      ...years,
      { ...years[0], id: 'year-active-2', name: '2027-2028' }
    ];
    expect(resolveStudentEnrollmentAcademicYear(ambiguous, { id: 'school-a' })).toBeNull();
  });
});
