import type { AcademicYear, Period } from '../types';

export const validateAcademicYear = (year: Partial<AcademicYear>): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (!year.schoolId) errors.push('schoolId is required');
  if (!year.name) errors.push('name is required');
  if (!year.startDate) errors.push('startDate is required');
  if (!year.endDate) errors.push('endDate is required');
  if (year.startDate && year.endDate && new Date(year.startDate) >= new Date(year.endDate)) {
    errors.push('startDate must be before endDate');
  }
  return { isValid: errors.length === 0, errors };
};

export const validatePeriod = (period: Partial<Period>, year: AcademicYear): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (!period.schoolId) errors.push('schoolId is required');
  if (!period.academicYearId) errors.push('academicYearId is required');
  if (period.academicYearId !== year.id) errors.push('Period must belong to the given academic year');
  if (!period.name) errors.push('name is required');
  if (!period.startDate) errors.push('startDate is required');
  if (!period.endDate) errors.push('endDate is required');
  
  if (period.startDate && period.endDate) {
    const pStart = new Date(period.startDate);
    const pEnd = new Date(period.endDate);
    const yStart = new Date(year.startDate);
    const yEnd = new Date(year.endDate);

    if (pStart >= pEnd) errors.push('startDate must be before endDate');
    if (pStart < yStart || pEnd > yEnd) errors.push('Period dates must be within academic year dates');
  }
  return { isValid: errors.length === 0, errors };
};

export const detectPeriodOverlap = (periods: Period[]): boolean => {
  const sorted = [...periods].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  for (let i = 0; i < sorted.length - 1; i++) {
    if (new Date(sorted[i].endDate) > new Date(sorted[i+1].startDate)) return true;
  }
  return false;
};

export const sortPeriods = (periods: Period[]): Period[] => {
  return [...periods].sort((a, b) => a.order - b.order);
};

export const getActiveAcademicYear = (years: AcademicYear[], schoolId: string): AcademicYear | undefined => {
  return years.find(y => y.schoolId === schoolId && y.status === 'active');
};

export const getOpenPeriod = (periods: Period[], schoolId: string, yearId: string): Period | undefined => {
  return periods.find(p => p.schoolId === schoolId && p.academicYearId === yearId && p.status === 'open');
};
