export const ACADEMIC_CALENDAR_SETTINGS_HASH = '#/settings?section=academic-calendar';
export const getCalendarActionUrl = (hasAcademicYears: boolean, hasSelectedYear: boolean, openPeriodsCount: number): string | null => {
  if (!hasAcademicYears) return ACADEMIC_CALENDAR_SETTINGS_HASH;
  if (hasSelectedYear && openPeriodsCount === 0) return ACADEMIC_CALENDAR_SETTINGS_HASH;
  return null;
};
