import { describe, it, expect } from 'vitest';
import {
  canManageAcademicCalendar,
  validateAcademicYearInput,
  validatePeriodInput,
  normalizeDateToISO,
  isValidISODateOnly,
  detectAcademicYearOverlap,
  detectPeriodOverlap,
  getCalendarConfigurationState,
  getPermittedPeriodTransitions,
  getPermittedAcademicYearTransitions,
  preparePeriodSubmission
} from '../../src/services/academicCalendarConfiguration';
import type { AcademicYear, Period } from '../../src/types';

describe('academicCalendarConfiguration', () => {
  describe('canManageAcademicCalendar', () => {
    it('allows owner and director', () => {
      expect(canManageAcademicCalendar('owner')).toBe(true);
      expect(canManageAcademicCalendar('director')).toBe(true);
      expect(canManageAcademicCalendar('superAdmin')).toBe(true);
    });
    it('rejects others', () => {
      expect(canManageAcademicCalendar('teacher')).toBe(false);
      expect(canManageAcademicCalendar('parent')).toBe(false);
      expect(canManageAcademicCalendar(undefined)).toBe(false);
    });
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

  describe('normalizeDateToISO and isValidISODateOnly', () => {
    it('normalizes YYYY-MM-DD', () => {
      expect(normalizeDateToISO('2026-09-05')).toBe('2026-09-05');
      expect(isValidISODateOnly('2026-09-05')).toBe(true);
    });
    it('rejects DD/MM/YYYY per strict contract', () => {
      expect(normalizeDateToISO('05/09/2026')).toBe(null);
      expect(isValidISODateOnly('05/09/2026')).toBe(false);
    });
    it('returns null for invalid dates', () => {
      expect(normalizeDateToISO('invalid-date')).toBe(null);
      expect(normalizeDateToISO('')).toBe(null);
      expect(normalizeDateToISO(null)).toBe(null);
      expect(isValidISODateOnly('2027-02-30')).toBe(false); // Validating strict bounds
      expect(normalizeDateToISO('2027-02-30')).toBe(null);
      expect(isValidISODateOnly('2028-02-29')).toBe(true); // Leap year
      expect(isValidISODateOnly('2027-02-29')).toBe(false); // Non-leap year
      expect(isValidISODateOnly('2027-13-01')).toBe(false); // Invalid month
    });
  });

  describe('validatePeriodInput', () => {
    const currentSchoolId = 'school-1';
    const academicYear = {
      id: 'ay-1',
      startDate: '2026-09-01',
      endDate: '2027-06-30'
    } as AcademicYear;

    const basePeriod = {
      schoolId: currentSchoolId,
      academicYearId: 'ay-1',
      name: 'Trimestre 1',
      type: 'term' as const,
      order: 1,
      status: 'draft' as const
    };

    it('1. accepts valid period strictly within year', () => {
      const { isValid, errors } = validatePeriodInput({
        ...basePeriod,
        startDate: '2026-09-05',
        endDate: '2026-12-20'
      }, academicYear, currentSchoolId);
      expect(isValid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('2. accepts date de début de période identique à celle de l année', () => {
      const { isValid } = validatePeriodInput({
        ...basePeriod,
        startDate: '2026-09-01',
        endDate: '2026-12-20'
      }, academicYear, currentSchoolId);
      expect(isValid).toBe(true);
    });

    it('3. accepts date de fin de période identique à celle de l année', () => {
      const { isValid } = validatePeriodInput({
        ...basePeriod,
        startDate: '2027-01-01',
        endDate: '2027-06-30'
      }, academicYear, currentSchoolId);
      expect(isValid).toBe(true);
    });

    it('4. rejects date de début antérieure à l année', () => {
      const { isValid, errors } = validatePeriodInput({
        ...basePeriod,
        startDate: '2026-08-31',
        endDate: '2026-12-20'
      }, academicYear, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("La date de début de la période ne peut pas être antérieure à celle de l'année académique.");
    });

    it('5. rejects date de fin postérieure à l année', () => {
      const { isValid, errors } = validatePeriodInput({
        ...basePeriod,
        startDate: '2027-05-01',
        endDate: '2027-07-01'
      }, academicYear, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("La date de fin de la période ne peut pas être postérieure à celle de l'année académique.");
    });

    it('rejette une période dont la date de fin précède la date de début', () => {
      const input = {
        name: 'Trimestre 1', type: 'term' as Period['type'], order: 1, startDate: '2026-12-20', endDate: '2026-09-05'
      };
      const result = validatePeriodInput(input, academicYear, currentSchoolId);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("La date de fin doit être postérieure ou égale à la date de début.");
    });

    it('accepts a one-day period whose start and end dates are identical', () => {
      const input = {
        name: 'Trimestre court', type: 'term' as Period['type'], order: 1, startDate: '2026-10-10', endDate: '2026-10-10'
      };
      const result = validatePeriodInput(input, academicYear, currentSchoolId);
      expect(result.errors).not.toContain("La date de fin doit être postérieure ou égale à la date de début.");
    });

    it('7. rejects strict invalid format dates (returns null)', () => {
      const { isValid, errors } = validatePeriodInput({
        ...basePeriod,
        startDate: '2027-02-30',
        endDate: '2027-12-20'
      }, academicYear, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("La date de début est invalide.");
    });

    it('8. rejects empty name', () => {
      const { isValid, errors } = validatePeriodInput({
        ...basePeriod,
        name: '   ',
        startDate: '2026-09-05',
        endDate: '2026-12-20'
      }, academicYear, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("Le nom de la période est obligatoire.");
    });

    it('9. rejects empty dates', () => {
      const { isValid, errors } = validatePeriodInput({
        ...basePeriod,
        startDate: '',
        endDate: ''
      }, academicYear, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("La date de début est invalide.");
      expect(errors).toContain("La date de fin est invalide.");
    });

    it('10. accepts valid leap year (2028-02-29)', () => {
      const { isValid } = validatePeriodInput({
        ...basePeriod,
        startDate: '2028-02-29',
        endDate: '2028-06-30'
      }, { ...academicYear, startDate: '2027-09-01', endDate: '2028-06-30' }, currentSchoolId);
      expect(isValid).toBe(true);
    });

    it('11. rejects invalid non-leap year (2027-02-29)', () => {
      const { isValid, errors } = validatePeriodInput({
        ...basePeriod,
        startDate: '2027-02-29',
        endDate: '2027-06-30'
      }, academicYear, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("La date de début est invalide.");
    });
    
    it('12. AcademicYear.startDate vide -> refus', () => {
      const { isValid, errors } = validatePeriodInput({
        ...basePeriod,
        startDate: '2026-09-05',
        endDate: '2026-12-20'
      }, { ...academicYear, startDate: '' }, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("La date de début de l'année académique est invalide. Corrigez l'année avant d'ajouter une période.");
    });

    it('13. AcademicYear.endDate vide -> refus', () => {
      const { isValid, errors } = validatePeriodInput({
        ...basePeriod,
        startDate: '2026-09-05',
        endDate: '2026-12-20'
      }, { ...academicYear, endDate: '' }, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("La date de fin de l'année académique est invalide. Corrigez l'année avant d'ajouter une période.");
    });

    it('14. AcademicYear.endDate = 30/06/2027 -> refus selon le contrat ISO strict', () => {
      const { isValid, errors } = validatePeriodInput({
        ...basePeriod,
        startDate: '2026-09-05',
        endDate: '2026-12-20'
      }, { ...academicYear, endDate: '30/06/2027' }, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("La date de fin de l'année académique est invalide. Corrigez l'année avant d'ajouter une période.");
    });

    it('15. AcademicYear.endDate impossible -> refus', () => {
      const { isValid, errors } = validatePeriodInput({
        ...basePeriod,
        startDate: '2026-09-05',
        endDate: '2026-12-20'
      }, { ...academicYear, endDate: '2027-13-45' }, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("La date de fin de l'année académique est invalide. Corrigez l'année avant d'ajouter une période.");
    });

    it('8. rejects empty name', () => {
      const { isValid, errors } = validatePeriodInput({
        ...basePeriod,
        name: '   ',
        startDate: '2026-09-05',
        endDate: '2026-12-20'
      }, academicYear, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("Le nom de la période est obligatoire.");
    });

    it('9. rejects empty dates', () => {
      const { isValid, errors } = validatePeriodInput({
        ...basePeriod,
        startDate: '',
        endDate: ''
      }, academicYear, currentSchoolId);
      expect(isValid).toBe(false);
      expect(errors).toContain("La date de début est invalide.");
      expect(errors).toContain("La date de fin est invalide.");
    });
  });

  describe('preparePeriodSubmission', () => {
    const currentSchoolId = 'school-1';
    const currentUser = { id: 'user-1' };
    const academicYear = {
      id: 'ay-1',
      startDate: '2026-09-01',
      endDate: '2027-06-30'
    } as AcademicYear;

    it('creates valid submission', () => {
      const { isValid, normalizedInput, fieldErrors } = preparePeriodSubmission({
        input: { name: ' Trim 1 ', type: 'term', order: 1, startDate: '2026-09-01', endDate: '2026-12-20' },
        academicYear,
        currentSchoolId,
        currentUser
      });
      expect(isValid).toBe(true);
      expect(fieldErrors).toEqual({});
      expect(normalizedInput).toBeTruthy();
      expect(normalizedInput?.name).toBe('Trim 1');
    });

    it('returns errors and no input when invalid', () => {
      const { isValid, normalizedInput, fieldErrors } = preparePeriodSubmission({
        input: { name: '', type: 'term', order: 1, startDate: '2026-09-01', endDate: '2027-07-01' },
        academicYear,
        currentSchoolId,
        currentUser
      });
      expect(isValid).toBe(false);
      expect(normalizedInput).toBeNull();
      expect(fieldErrors.name).toBeDefined();
      expect(fieldErrors.endDate).toBeDefined();
      expect(fieldErrors.startDate).toBeUndefined();
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

    it('throws error for invalid ISO dates', () => {
      expect(() => detectAcademicYearOverlap('01/05/2026', '2027-05-01', existing)).toThrow("Toutes les dates doivent être ISO valides pour vérifier le chevauchement.");
    });
  });

  describe('detectPeriodOverlap', () => {
    const existing: Period[] = [
      { id: 'p-1', startDate: '2026-09-01', endDate: '2026-12-20' } as Period
    ];

    it('detects overlap', () => {
      expect(detectPeriodOverlap('2026-12-01', '2027-03-31', existing)).toBe(true);
    });

    it('does not detect overlap', () => {
      expect(detectPeriodOverlap('2027-01-01', '2027-03-31', existing)).toBe(false);
    });

    it('throws error for invalid ISO dates', () => {
      expect(() => detectPeriodOverlap('2027-01-01', 'invalid', existing)).toThrow("Toutes les dates doivent être ISO valides pour vérifier le chevauchement.");
    });
  });

  describe('Transitions', () => {
    it('Permitted AcademicYear transitions', () => {
      expect(getPermittedAcademicYearTransitions('draft')).toEqual(['active']);
      expect(getPermittedAcademicYearTransitions('active')).toEqual(['closed']);
    });
    it('Permitted Period transitions', () => {
      expect(getPermittedPeriodTransitions('draft')).toEqual(['open']);
      expect(getPermittedPeriodTransitions('open')).toEqual(['closed']);
    });
  });

  describe('getCalendarConfigurationState', () => {
    it('returns NONE when no active year', () => {
      expect(getCalendarConfigurationState([], [])).toBe('NONE');
    });
    it('returns NO_PERIODS when active year has no periods', () => {
      expect(getCalendarConfigurationState([{ id: 'y1', status: 'active' } as AcademicYear], [])).toBe('NO_PERIODS');
    });
    it('returns NO_OPEN_PERIOD when active year has closed periods', () => {
      expect(getCalendarConfigurationState(
        [{ id: 'y1', status: 'active' } as AcademicYear],
        [{ academicYearId: 'y1', status: 'closed' } as Period]
      )).toBe('NO_OPEN_PERIOD');
    });
    it('returns READY when active year has open period', () => {
      expect(getCalendarConfigurationState(
        [{ id: 'y1', status: 'active' } as AcademicYear],
        [{ academicYearId: 'y1', status: 'open' } as Period]
      )).toBe('READY');
    });
  });
});
