import { expect, it } from 'vitest';
import { summarizeObjectiveEvidence } from '../../src/features/pedagogy/services/observationEvidence';
const scope = { schoolId: 'synthetic-school', academicYearId: 'synthetic-year', classId: 'synthetic-class', studentId: 'synthetic-student' };
const row = { ...scope, id: 'old', subjectId: 'language', objective: 'Identify initial sounds', date: '2026-09-01', state: 'discovering' };
it('groups exact objectives, retaining dated evidence without inferring stable mastery', () => {
  const result = summarizeObjectiveEvidence([row, { ...row, id: 'latest', date: '2026-09-02', state: 'acquired' }, { ...row, id: 'distinct', objective: 'Identify sounds' }], scope);
  expect(result).toHaveLength(2);
  expect(result.find(item => item.objective === row.objective)).toMatchObject({ states: ['acquired'], latestDate: '2026-09-02', currentObservationCount: 2, latestObservationIds: ['latest'], conflicting: false });
  expect(result[0]).not.toHaveProperty('mastery');
});
it('excludes superseded, foreign-scope, malformed and numerical grade rows', () => {
  expect(summarizeObjectiveEvidence([{ ...row, supersededBy: 'correction' }, { ...row, studentId: 'other' }, { ...row, schoolId: 'other' }, { ...row, academicYearId: 'other' }, { ...row, classId: 'other' }, { ...row, state: 'scored', score: 20 }, { ...row, date: '' }], scope)).toEqual([]);
});
it('shows same-date conflicting situations and never turns not-observed into failure', () => {
  const [result] = summarizeObjectiveEvidence([row, { ...row, id: 'second', state: 'not_observed' }], scope);
  expect(result.states).toEqual(['discovering', 'not_observed']);
  expect(result.conflicting).toBe(true);
  expect(result.latestObservationIds).toEqual(['old', 'second']);
});
