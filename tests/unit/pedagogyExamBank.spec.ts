import { expect, it, vi } from 'vitest';
vi.mock('../../src/db/firebase', () => ({ db: {} }));
import { internalExamBankEntries } from '../../src/features/pedagogy/services/examBank';
import type { WeeklyAssessment } from '../../src/features/pedagogy/types';
const entry = { id: 'synthetic', schoolId: 'a', academicYearId: 'year', classId: 'class', generationStatus: 'succeeded', teacherValidated: true, status: 'ready_to_print', fridayDate: '2026-09-04', generationVersion: 1 } as WeeklyAssessment;
it('excludes drafts, revoked validations, other tenants and other periods', () => {
  const excluded = [{ ...entry, schoolId: 'b' }, { ...entry, academicYearId: 'old' }, { ...entry, classId: 'other' }, { ...entry, teacherValidated: false }, { ...entry, status: 'needs_review' }, { ...entry, generationStatus: 'failed' }, { ...entry, status: 'archived' }] as WeeklyAssessment[];
  expect(internalExamBankEntries([entry, ...excluded], 'a', 'year', 'class')).toEqual([entry]);
});
it('orders historical entries without changing their validation or input order', () => {
  const newer = { ...entry, id: 'newer', fridayDate: '2026-09-11' };
  const original = [entry, newer];
  expect(internalExamBankEntries(original, 'a', 'year', 'class').map(item => item.id)).toEqual(['newer', 'synthetic']);
  expect(original).toEqual([entry, newer]);
});
