const safePart = (value: string): string => {
  const clean = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!clean || clean.length > 100) throw new Error('INVALID_ID_PART');
  return clean;
};

export const mondayIso = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_DATE');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('INVALID_DATE');
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
};

export const addDaysIso = (value: string, days: number): string => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const teachingWeekId = (schoolId: string, academicYearId: string, start: string): string =>
  `${safePart(schoolId)}__${safePart(academicYearId)}__${mondayIso(start)}`;

export const teachingPlanId = (schoolId: string, academicYearId: string, classId: string, start: string): string =>
  `${safePart(schoolId)}__${safePart(academicYearId)}__${safePart(classId)}__${mondayIso(start)}`;

export const teachingPlanItemId = (planId: string, subjectId: string, day: number, slot: number): string => {
  if (!Number.isInteger(day) || day < 1 || day > 5 || !Number.isInteger(slot) || slot < 1 || slot > 12) throw new Error('INVALID_SLOT');
  return `${planId}__${safePart(subjectId)}__d${day}__s${slot}`;
};

export const adoptionId = (schoolId: string, academicYearId: string, levelId: string): string =>
  `${safePart(schoolId)}__${safePart(academicYearId)}__${safePart(levelId)}`;
