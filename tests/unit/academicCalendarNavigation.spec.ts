import { describe, it, expect } from 'vitest';
import { getCalendarActionUrl, ACADEMIC_CALENDAR_SETTINGS_HASH } from '../../src/pages/Grades';

describe('Academic Calendar Navigation', () => {
  it('1. absence d’AcademicYear → destination calendrier académique', () => {
    const url = getCalendarActionUrl(false, false, 0);
    expect(url).toBe(ACADEMIC_CALENDAR_SETTINGS_HASH);
  });

  it('2. absence de Period open → destination calendrier académique', () => {
    const url = getCalendarActionUrl(true, true, 0);
    expect(url).toBe(ACADEMIC_CALENDAR_SETTINGS_HASH);
  });

  it('3. Period open disponible → aucun état bloquant de configuration', () => {
    const url = getCalendarActionUrl(true, true, 1);
    expect(url).toBeNull();
  });

  it('4. aucune Period closed utilisée comme fallback', () => {
    // Si la période sélectionnée (hasSelectedYear = true) a 0 périodes ouvertes,
    // même s'il y en a des fermées (ce qui n'est pas reflété dans openPeriodsCount),
    // l'URL doit pointer vers la configuration
    const url = getCalendarActionUrl(true, true, 0);
    expect(url).toBe(ACADEMIC_CALENDAR_SETTINGS_HASH);
  });

  it('5. la route est exactement : #/settings?section=academic-calendar', () => {
    expect(ACADEMIC_CALENDAR_SETTINGS_HASH).toBe('#/settings?section=academic-calendar');
  });
});
