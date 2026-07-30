import { describe, it, expect, vi } from 'vitest';
import { preparePeriodSubmission, submitValidatedPeriod } from '../../src/services/academicCalendarConfiguration';
import type { AcademicYear } from '../../src/types';

describe('Period Submission Spy Test', () => {
  const currentSchoolId = 'school-1';
  const currentUser = { id: 'user-1' };
  const academicYear = {
    id: 'ay-1',
    startDate: '2026-09-01',
    endDate: '2027-06-30'
  } as AcademicYear;

  it('1. nom vide -> persist non appelée', async () => {
    const mockPersist = vi.fn().mockResolvedValue(undefined);
    const submission = preparePeriodSubmission({
      input: { startDate: '2026-09-05', endDate: '2026-12-20', name: '   ', type: 'term', order: 1 },
      academicYear, currentSchoolId, currentUser
    });
    const result = await submitValidatedPeriod({ submission, persist: mockPersist });
    expect(result).toBe(false);
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it('2. date impossible -> persist non appelée', async () => {
    const mockPersist = vi.fn().mockResolvedValue(undefined);
    const submission = preparePeriodSubmission({
      input: { startDate: '2027-02-30', endDate: '2027-12-20', name: 'Trim', type: 'term', order: 1 },
      academicYear, currentSchoolId, currentUser
    });
    const result = await submitValidatedPeriod({ submission, persist: mockPersist });
    expect(result).toBe(false);
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it('3. AcademicYear invalide -> persist non appelée', async () => {
    const mockPersist = vi.fn().mockResolvedValue(undefined);
    const invalidYear = { ...academicYear, startDate: 'invalid' } as AcademicYear;
    const submission = preparePeriodSubmission({
      input: { startDate: '2026-09-05', endDate: '2026-12-20', name: 'Trim', type: 'term', order: 1 },
      academicYear: invalidYear, currentSchoolId, currentUser
    });
    const result = await submitValidatedPeriod({ submission, persist: mockPersist });
    expect(result).toBe(false);
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it('4. période hors limites -> persist non appelée', async () => {
    const mockPersist = vi.fn().mockResolvedValue(undefined);
    const submission = preparePeriodSubmission({
      input: { startDate: '2025-09-05', endDate: '2026-12-20', name: 'Trim', type: 'term', order: 1 },
      academicYear, currentSchoolId, currentUser
    });
    const result = await submitValidatedPeriod({ submission, persist: mockPersist });
    expect(result).toBe(false);
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it('5. entrée valide -> persist appelée exactement une fois avec le Period normalisé', async () => {
    const mockPersist = vi.fn().mockResolvedValue(undefined);
    const submission = preparePeriodSubmission({
      input: { startDate: '2026-09-05', endDate: '2026-12-20', name: 'Trim 1', type: 'term', order: 1 },
      academicYear, currentSchoolId, currentUser
    });
    const result = await submitValidatedPeriod({ submission, persist: mockPersist });
    expect(result).toBe(true);
    expect(mockPersist).toHaveBeenCalledTimes(1);
    expect(mockPersist.mock.calls[0][0].name).toBe('Trim 1');
  });

  it('6. rejet de persist -> aucune réussite UI prématurée (throw error)', async () => {
    const errorMsg = 'Erreur réseau';
    const mockPersist = vi.fn().mockRejectedValue(new Error(errorMsg));
    const submission = preparePeriodSubmission({
      input: { startDate: '2026-09-05', endDate: '2026-12-20', name: 'Trim 1', type: 'term', order: 1 },
      academicYear, currentSchoolId, currentUser
    });
    await expect(submitValidatedPeriod({ submission, persist: mockPersist })).rejects.toThrow(errorMsg);
  });
});

