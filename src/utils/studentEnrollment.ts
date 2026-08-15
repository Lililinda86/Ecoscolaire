import type { AcademicYear, School } from '../types';

/**
 * Resolves the single active academic year used for a new student record.
 * The school pointer is authoritative when present; legacy schools without a
 * pointer are accepted only when exactly one active year exists.
 */
export function resolveStudentEnrollmentAcademicYear(
  academicYears: AcademicYear[] | undefined,
  school: Pick<School, 'id' | 'activeAcademicYearId'> | null | undefined
): AcademicYear | null {
  if (!school || !academicYears) return null;

  const schoolYears = academicYears.filter(year => year.schoolId === school.id);

  if (school.activeAcademicYearId) {
    return schoolYears.find(
      year => year.id === school.activeAcademicYearId && year.status === 'active'
    ) ?? null;
  }

  const activeYears = schoolYears.filter(year => year.status === 'active');
  return activeYears.length === 1 ? activeYears[0] : null;
}
