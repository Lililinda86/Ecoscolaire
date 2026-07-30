import type { AcademicYear, Period, GlobalRole } from '../types';

export class AcademicCalendarMutationCancelledError extends Error {
  constructor(message: string = "Action annulée.") {
    super(message);
    this.name = 'AcademicCalendarMutationCancelledError';
  }
}

export function canManageAcademicCalendar(role: GlobalRole | undefined): boolean {
  if (!role) return false;
  return role === 'owner' || role === 'director' || role === 'superAdmin';
}

export function validateAcademicYearInput(
  input: Partial<AcademicYear>,
  currentSchoolId: string
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.schoolId || input.schoolId !== currentSchoolId) {
    errors.push("L'identifiant de l'école (schoolId) est invalide.");
  }
  if (!input.name || input.name.trim() === '') {
    errors.push("Le nom de l'année académique est obligatoire.");
  }
  if (!input.startDate || isNaN(Date.parse(input.startDate))) {
    errors.push("La date de début est invalide.");
  }
  if (!input.endDate || isNaN(Date.parse(input.endDate))) {
    errors.push("La date de fin est invalide.");
  }
  if (input.startDate && input.endDate && new Date(input.endDate) <= new Date(input.startDate)) {
    errors.push("La date de fin doit être postérieure à la date de début.");
  }
  if (!input.status || !['draft', 'active', 'closed', 'archived'].includes(input.status)) {
    errors.push("Le statut initial est invalide.");
  }

  return { isValid: errors.length === 0, errors };
}

export function validatePeriodInput(
  input: Partial<Period>,
  academicYear: AcademicYear,
  currentSchoolId: string
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.schoolId || input.schoolId !== currentSchoolId) {
    errors.push("L'identifiant de l'école (schoolId) est invalide.");
  }
  if (!input.academicYearId || input.academicYearId !== academicYear.id) {
    errors.push("L'année académique associée est invalide.");
  }
  if (!input.name || input.name.trim() === '') {
    errors.push("Le nom de la période est obligatoire.");
  }
  if (!input.type || !['term', 'semester', 'sequence', 'custom'].includes(input.type)) {
    errors.push("Le type de période est invalide.");
  }
  if (typeof input.order !== 'number' || input.order < 1) {
    errors.push("L'ordre de la période doit être un entier positif.");
  }
  if (!input.startDate || isNaN(Date.parse(input.startDate))) {
    errors.push("La date de début est invalide.");
  }
  if (!input.endDate || isNaN(Date.parse(input.endDate))) {
    errors.push("La date de fin est invalide.");
  }
  if (input.startDate && input.endDate && new Date(input.endDate) <= new Date(input.startDate)) {
    errors.push("La date de fin doit être postérieure à la date de début.");
  }
  
  if (input.startDate && academicYear.startDate && new Date(input.startDate) < new Date(academicYear.startDate)) {
    errors.push("La date de début de la période ne peut pas être antérieure à celle de l'année académique.");
  }
  if (input.endDate && academicYear.endDate && new Date(input.endDate) > new Date(academicYear.endDate)) {
    errors.push("La date de fin de la période ne peut pas être postérieure à celle de l'année académique.");
  }

  if (!input.status || !['draft', 'open', 'closed', 'published', 'archived'].includes(input.status)) {
    errors.push("Le statut initial est invalide.");
  }

  return { isValid: errors.length === 0, errors };
}

export function detectAcademicYearOverlap(
  newYearStart: string,
  newYearEnd: string,
  existingYears: AcademicYear[],
  excludeYearId?: string
): boolean {
  const start = new Date(newYearStart).getTime();
  const end = new Date(newYearEnd).getTime();

  return existingYears.some(year => {
    if (excludeYearId && year.id === excludeYearId) return false;
    const yearStart = new Date(year.startDate).getTime();
    const yearEnd = new Date(year.endDate).getTime();
    return start < yearEnd && end > yearStart;
  });
}

export function detectPeriodOverlap(
  newPeriodStart: string,
  newPeriodEnd: string,
  existingPeriods: Period[],
  excludePeriodId?: string
): boolean {
  const start = new Date(newPeriodStart).getTime();
  const end = new Date(newPeriodEnd).getTime();

  return existingPeriods.some(period => {
    if (excludePeriodId && period.id === excludePeriodId) return false;
    const pStart = new Date(period.startDate).getTime();
    const pEnd = new Date(period.endDate).getTime();
    return start < pEnd && end > pStart;
  });
}

export function buildAcademicYearId(schoolId: string, startDate: string, endDate: string): string {
  const yearStr = `${new Date(startDate).getFullYear()}-${new Date(endDate).getFullYear()}`;
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `ay_${schoolId}_${yearStr}_${randomSuffix}`;
}

export function buildPeriodId(academicYearId: string, order: number): string {
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `per_${academicYearId}_${order}_${randomSuffix}`;
}

export function getCalendarConfigurationState(
  academicYears: AcademicYear[],
  periods: Period[]
): 'NONE' | 'NO_PERIODS' | 'NO_OPEN_PERIOD' | 'READY' {
  const activeYear = academicYears.find(y => y.status === 'active');
  if (!activeYear) return 'NONE';

  const activeYearPeriods = periods.filter(p => p.academicYearId === activeYear.id);
  if (activeYearPeriods.length === 0) return 'NO_PERIODS';

  const openPeriod = activeYearPeriods.find(p => p.status === 'open');
  if (!openPeriod) return 'NO_OPEN_PERIOD';

  return 'READY';
}

export function getPermittedPeriodTransitions(currentStatus: Period['status']): Period['status'][] {
  switch (currentStatus) {
    case 'draft':
      return ['open'];
    case 'open':
      return ['closed'];
    case 'closed':
      return ['open', 'published', 'archived'];
    case 'published':
      return ['archived'];
    case 'archived':
      return [];
    default:
      return [];
  }
}

export function getPermittedAcademicYearTransitions(currentStatus: AcademicYear['status']): AcademicYear['status'][] {
  switch (currentStatus) {
    case 'draft':
      return ['active'];
    case 'active':
      return ['closed'];
    case 'closed':
      return ['archived'];
    case 'archived':
      return [];
    default:
      return [];
  }
}
