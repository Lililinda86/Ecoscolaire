import { describe, it, expect } from 'vitest';
import {
  validateAcademicYearInput,
  validatePeriodInput,
  detectAcademicYearOverlap,
  detectPeriodOverlap,
  canManageAcademicCalendar,
  getPermittedAcademicYearTransitions,
  getPermittedPeriodTransitions,
  getCalendarConfigurationState
} from '../../src/services/academicCalendarConfiguration';
import type { AcademicYear, Period } from '../../src/types';

describe('academicCalendarConfiguration', () => {
  it('canManageAcademicCalendar allows owner and director', () => {
    expect(canManageAcademicCalendar('owner')).toBe(true);
    expect(canManageAcademicCalendar('director')).toBe(true);
    expect(canManageAcademicCalendar('superAdmin')).toBe(true);
    expect(canManageAcademicCalendar('teacher')).toBe(false);
    expect(canManageAcademicCalendar('parent')).toBe(false);
    expect(canManageAcademicCalendar(undefined)).toBe(false);
  });

  describe('validateAcademicYearInput', () => {
    const currentSchoolId = 'school-1';
    
    it('accepts valid input', () => {
      const { isValid, errors } = validateAcademicYearInput({
        schoolId: currentSchoolId,
        name: '2026-2027',
        startDate: '2026-09-01',
        endDate: '2027-06-30',
        status: 'draft'
      }, currentSchoolId);
      expect(isValid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('rejects external schoolId', () => {
      const { isValid, errors } = validateAcademicYearInput({
        schoolId: 'other-school',
        name: '2026-2027',
        startDate: '2026-09-01',
        endDate: '2027-06-30',
        status: 'draft'
      }, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("L'identifiant de l'école (schoolId) est invalide.");
    });

    it('rejects empty name', () => {
      const { isValid, errors } = validateAcademicYearInput({
        schoolId: currentSchoolId,
        name: '  ',
        startDate: '2026-09-01',
        endDate: '2027-06-30',
        status: 'draft'
      }, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("Le nom de l'année académique est obligatoire.");
    });

    it('rejects endDate <= startDate', () => {
      const { isValid, errors } = validateAcademicYearInput({
        schoolId: currentSchoolId,
        name: '2026-2027',
        startDate: '2026-09-01',
        endDate: '2026-08-30',
        status: 'draft'
      }, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("La date de fin doit être postérieure à la date de début.");
    });
  });

  describe('validatePeriodInput', () => {
    const currentSchoolId = 'school-1';
    const academicYear = {
      id: 'ay-1',
      startDate: '2026-09-01',
      endDate: '2027-06-30'
    } as AcademicYear;

    it('accepts valid period', () => {
      const { isValid, errors } = validatePeriodInput({
        schoolId: currentSchoolId,
        academicYearId: 'ay-1',
        name: 'Trimestre 1',
        type: 'term',
        order: 1,
        startDate: '2026-09-05',
        endDate: '2026-12-20',
        status: 'draft'
      }, academicYear, currentSchoolId);
      expect(isValid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('rejects period outside academic year', () => {
      const { isValid, errors } = validatePeriodInput({
        schoolId: currentSchoolId,
        academicYearId: 'ay-1',
        name: 'Trimestre 1',
        type: 'term',
        order: 1,
        startDate: '2026-08-01',
        endDate: '2026-12-20',
        status: 'draft'
      }, academicYear, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("La date de début de la période ne peut pas être antérieure à celle de l'année académique.");
    });
  });

  describe('detectAcademicYearOverlap', () => {
    const existing: AcademicYear[] = [
      { id: 'ay-1', startDate: '2025-09-01', endDate: '2026-06-30' } as AcademicYear
    ];

    it('detects overlap', () => {
      expect(detectAcademicYearOverlap('2026-05-01', '2027-05-01', existing)).toBe(true);
    });

    it('does not detect overlap for distinct dates', () => {
      expect(detectAcademicYearOverlap('2026-09-01', '2027-06-30', existing)).toBe(false);
    });
  });

  describe('detectPeriodOverlap', () => {
    const existing: Period[] = [
      { id: 'p-1', startDate: '2026-09-01', endDate: '2026-12-20' } as Period
    ];

    it('detects overlap', () => {
      expect(detectPeriodOverlap('2026-11-01', '2027-03-01', existing)).toBe(true);
    });

    it('does not detect overlap', () => {
      expect(detectPeriodOverlap('2027-01-01', '2027-03-31', existing)).toBe(false);
    });
  });

  describe('Transitions', () => {
    it('Permitted AcademicYear transitions', () => {
      expect(getPermittedAcademicYearTransitions('draft')).toContain('active');
      expect(getPermittedAcademicYearTransitions('active')).toContain('closed');
    });

    it('Permitted Period transitions', () => {
      expect(getPermittedPeriodTransitions('draft')).toContain('open');
      expect(getPermittedPeriodTransitions('open')).toContain('closed');
      expect(getPermittedPeriodTransitions('closed')).toContain('open');
      expect(getPermittedPeriodTransitions('closed')).toContain('published');
    });
  });

  describe('getCalendarConfigurationState', () => {
    it('returns NONE when no active year', () => {
      expect(getCalendarConfigurationState([], [])).toBe('NONE');
    });

    it('returns NO_PERIODS when active year has no periods', () => {
      const years = [{ id: 'ay1', status: 'active' } as AcademicYear];
      expect(getCalendarConfigurationState(years, [])).toBe('NO_PERIODS');
    });

    it('returns NO_OPEN_PERIOD when active year has closed periods', () => {
      const years = [{ id: 'ay1', status: 'active' } as AcademicYear];
      const periods = [{ id: 'p1', academicYearId: 'ay1', status: 'closed' } as Period];
      expect(getCalendarConfigurationState(years, periods)).toBe('NO_OPEN_PERIOD');
    });

    it('returns READY when active year has open period', () => {
      const years = [{ id: 'ay1', status: 'active' } as AcademicYear];
      const periods = [{ id: 'p1', academicYearId: 'ay1', status: 'open' } as Period];
      expect(getCalendarConfigurationState(years, periods)).toBe('READY');
    });
  });
});
