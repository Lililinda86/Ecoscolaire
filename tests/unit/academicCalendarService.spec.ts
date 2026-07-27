import { describe, it, expect } from 'vitest';
import { validateAcademicYear, validatePeriod, detectPeriodOverlap, sortPeriods } from '../../src/services/academicCalendar';
import type { AcademicYear, Period } from '../../src/types';

describe('Academic Calendar Service', () => {
  const validYear: AcademicYear = {
    id: 'ay_1',
    schoolId: 'sch_1',
    name: '2026-2027',
    startDate: '2026-09-01',
    endDate: '2027-06-30',
    status: 'active',
    createdAt: '', createdBy: '', updatedAt: '', updatedBy: ''
  };

  it('1. création AcademicYear valide', () => {
    const res = validateAcademicYear(validYear);
    expect(res.isValid).toBe(true);
  });

  it('2. année avec dates inversées refusée', () => {
    const invalid = { ...validYear, startDate: '2027-06-30', endDate: '2026-09-01' };
    const res = validateAcademicYear(invalid);
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('startDate must be before endDate');
  });

  const validPeriod: Period = {
    id: 'prd_1',
    schoolId: 'sch_1',
    academicYearId: 'ay_1',
    name: 'T1',
    type: 'term',
    order: 1,
    startDate: '2026-09-01',
    endDate: '2026-12-20',
    status: 'open',
    createdAt: '', createdBy: '', updatedAt: '', updatedBy: ''
  };

  it('4. période valide', () => {
    const res = validatePeriod(validPeriod, validYear);
    expect(res.isValid).toBe(true);
  });

  it('5. période hors année refusée', () => {
    const invalid = { ...validPeriod, endDate: '2027-07-15' };
    const res = validatePeriod(invalid, validYear);
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('Period dates must be within academic year dates');
  });

  it('6. périodes qui se chevauchent', () => {
    const p1 = validPeriod;
    const p2 = { ...validPeriod, id: 'prd_2', startDate: '2026-12-01', endDate: '2027-03-01' };
    expect(detectPeriodOverlap([p1, p2])).toBe(true);
  });

  it('7. tri des périodes', () => {
    const p1 = { ...validPeriod, order: 2 };
    const p2 = { ...validPeriod, order: 1 };
    const sorted = sortPeriods([p1, p2]);
    expect(sorted[0].order).toBe(1);
  });
});
