import type { AcademicYear, Period, GlobalRole } from '../types';
import { buildPeriodId } from '../utils/gradeIds';

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

export function isValidISODateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return false;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return day >= 1 && day <= daysInMonth;
}

export function normalizeDateToISO(dateValue: string | undefined | null): string | null {
  if (!dateValue) return null;
  return isValidISODateOnly(dateValue) ? dateValue : null;
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

  const startISO = normalizeDateToISO(input.startDate);
  const endISO = normalizeDateToISO(input.endDate);

  if (!startISO) {
    errors.push("La date de début est invalide.");
  }
  if (!endISO) {
    errors.push("La date de fin est invalide.");
  }
  if (startISO && endISO && endISO <= startISO) {
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

  const startISO = normalizeDateToISO(input.startDate);
  const endISO = normalizeDateToISO(input.endDate);
  const yearStartISO = normalizeDateToISO(academicYear.startDate);
  const yearEndISO = normalizeDateToISO(academicYear.endDate);

  if (!yearStartISO) {
    errors.push("La date de début de l'année académique est invalide. Corrigez l'année avant d'ajouter une période.");
  }
  if (!yearEndISO) {
    errors.push("La date de fin de l'année académique est invalide. Corrigez l'année avant d'ajouter une période.");
  }

  if (!startISO) {
    errors.push("La date de début est invalide.");
  }
  if (!endISO) {
    errors.push("La date de fin est invalide.");
  }
  if (startISO && endISO && endISO <= startISO) {
    errors.push("La date de fin doit être postérieure à la date de début.");
  }
  
  if (startISO && yearStartISO && startISO < yearStartISO) {
    errors.push("La date de début de la période ne peut pas être antérieure à celle de l'année académique.");
  }
  if (endISO && yearEndISO && endISO > yearEndISO) {
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
  if (!isValidISODateOnly(newYearStart) || !isValidISODateOnly(newYearEnd)) {
    throw new Error("Toutes les dates doivent être ISO valides pour vérifier le chevauchement.");
  }
  return existingYears.some(year => {
    if (excludeYearId && year.id === excludeYearId) return false;
    return newYearStart < year.endDate && newYearEnd > year.startDate;
  });
}

export function detectPeriodOverlap(
  newPeriodStart: string,
  newPeriodEnd: string,
  existingPeriods: Period[],
  excludePeriodId?: string
): boolean {
  if (!isValidISODateOnly(newPeriodStart) || !isValidISODateOnly(newPeriodEnd)) {
    throw new Error("Toutes les dates doivent être ISO valides pour vérifier le chevauchement.");
  }
  return existingPeriods.some(period => {
    if (excludePeriodId && period.id === excludePeriodId) return false;
    return newPeriodStart < period.endDate && newPeriodEnd > period.startDate;
  });
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
export interface PeriodSubmissionInput {
  input: Partial<Period>;
  academicYear: AcademicYear;
  currentSchoolId: string;
  currentUser: { id: string };
}

export interface PeriodFieldErrors {
  name?: string;
  startDate?: string;
  endDate?: string;
  academicYear?: string;
  general?: string;
}

export function preparePeriodSubmission(params: PeriodSubmissionInput): {
  normalizedInput: Period | null;
  fieldErrors: PeriodFieldErrors;
  isValid: boolean;
} {
  const { input, academicYear, currentSchoolId, currentUser } = params;
  
  let typeValue: Period['type'] = 'term';
  if (input.type === 'term' || input.type === 'semester' || input.type === 'sequence' || input.type === 'custom') {
    typeValue = input.type;
  }

  let statusValue: Period['status'] = 'draft';
  if (input.status === 'draft' || input.status === 'open' || input.status === 'closed' || input.status === 'published' || input.status === 'archived') {
    statusValue = input.status;
  }

  const payload: Partial<Period> = {
    schoolId: currentSchoolId,
    academicYearId: academicYear.id,
    name: input.name?.trim() || '',
    type: typeValue,
    order: input.order || 1,
    startDate: input.startDate || '',
    endDate: input.endDate || '',
    status: statusValue,
  };

  const validation = validatePeriodInput(payload, academicYear, currentSchoolId);
  const fieldErrors: PeriodFieldErrors = {};

  if (!validation.isValid) {
    validation.errors.forEach(err => {
      if (err.includes("nom")) fieldErrors.name = err;
      else if (err.includes("l'année académique est invalide")) fieldErrors.academicYear = err;
      else if (err.includes("début est invalide") || err.includes("antérieure à celle de l'année")) fieldErrors.startDate = err;
      else if (err.includes("fin est invalide") || err.includes("postérieure à la date de début") || err.includes("postérieure à celle de l'année")) fieldErrors.endDate = err;
      else fieldErrors.general = err;
    });
    return { normalizedInput: null, fieldErrors, isValid: false };
  }

  const id = input.id || buildPeriodId(academicYear.id, payload.order as number);
  const finalPayload: Period = {
    ...payload,
    id,
    type: typeValue,
    order: payload.order as number,
    schoolId: payload.schoolId as string,
    academicYearId: payload.academicYearId as string,
    name: payload.name as string,
    startDate: payload.startDate as string,
    endDate: payload.endDate as string,
    status: statusValue,
    createdAt: input.createdAt || new Date().toISOString(),
    createdBy: input.createdBy || currentUser.id,
    updatedAt: new Date().toISOString(),
    updatedBy: currentUser.id
  };

  return { normalizedInput: finalPayload, fieldErrors: {}, isValid: true };
}

export async function submitValidatedPeriod({
  submission,
  persist
}: {
  submission: ReturnType<typeof preparePeriodSubmission>;
  persist: (period: Period) => Promise<void>;
}): Promise<boolean> {
  if (!submission.isValid || !submission.normalizedInput) {
    return false;
  }

  await persist(submission.normalizedInput);
  return true;
}

