import { describe, expect, test } from 'vitest';
import {
  calculateCanonicalGeneral,
  calculateCanonicalSubject,
  normalizeCanonicalGrade,
} from '../../functions/src/academic/canonicalGradeCalculations';

describe('W2-05 canonical report-card calculations', () => {
  test('normalizes mixed /10, /20, /40 and /100 scales without early rounding', () => {
    const results = [
      normalizeCanonicalGrade({ evaluationId: 'e10', resultStatus: 'scored', score: 7, maxScore: 10 }),
      normalizeCanonicalGrade({ evaluationId: 'e20', resultStatus: 'scored', score: 13, maxScore: 20 }),
      normalizeCanonicalGrade({ evaluationId: 'e40', resultStatus: 'scored', score: 31, maxScore: 40 }),
      normalizeCanonicalGrade({ evaluationId: 'e100', resultStatus: 'scored', score: 84, maxScore: 100 }),
    ];
    expect(results.map(result => result.normalizedScore)).toEqual([14, 13, 15.5, 16.8]);
    const subject = calculateCanonicalSubject(results, 2);
    expect(subject.rawAverage).toBeCloseTo(14.825, 12);
    expect(subject.displayedAverage).toBe('14,83');
    expect(subject.weightedPoints).toBeCloseTo(29.65, 12);
  });

  test('respects evaluation weights and subject coefficients', () => {
    const math = calculateCanonicalSubject([
      normalizeCanonicalGrade({ evaluationId: 'quiz', resultStatus: 'scored', score: 10, maxScore: 20, weight: 1 }),
      normalizeCanonicalGrade({ evaluationId: 'exam', resultStatus: 'scored', score: 18, maxScore: 20, weight: 3 }),
    ], 3);
    const french = calculateCanonicalSubject([
      normalizeCanonicalGrade({ evaluationId: 'fr', resultStatus: 'scored', score: 14, maxScore: 20 }),
    ], 1);
    expect(math.rawAverage).toBe(16);
    expect(calculateCanonicalGeneral([{ ...math, coefficient: 3 }, { ...french, coefficient: 1 }])).toEqual({
      generalAverage: 15.5,
      totalPoints: 62,
      totalCoefficients: 4,
    });
  });

  test('keeps zero valid and keeps absent, excused and missing distinct from zero', () => {
    const zero = normalizeCanonicalGrade({ evaluationId: 'zero', resultStatus: 'scored', score: 0, maxScore: 20 });
    const absent = normalizeCanonicalGrade({ evaluationId: 'absent', resultStatus: 'absent', maxScore: 20 });
    const excused = normalizeCanonicalGrade({ evaluationId: 'excused', resultStatus: 'excused', maxScore: 20 });
    const missing = normalizeCanonicalGrade({ evaluationId: 'missing', resultStatus: 'missing', maxScore: 20 });
    expect(zero).toMatchObject({ calculable: true, normalizedScore: 0 });
    expect([absent, excused, missing].map(value => value.normalizedScore)).toEqual([null, null, null]);
    expect([absent, excused, missing].map(value => value.reason)).toEqual(['absent', 'excused', 'missing']);
  });

  test('fails closed for invalid scores and a missing coefficient', () => {
    const invalid = normalizeCanonicalGrade({ evaluationId: 'bad', resultStatus: 'scored', score: 21, maxScore: 20 });
    expect(invalid).toMatchObject({ calculable: false, reason: 'invalid_score' });
    expect(calculateCanonicalSubject([], 1).status).toBe('no_grades');
    const scored = normalizeCanonicalGrade({ evaluationId: 'ok', resultStatus: 'scored', score: 12, maxScore: 20 });
    expect(calculateCanonicalSubject([scored], null)).toMatchObject({
      rawAverage: 12,
      calculable: false,
      status: 'missing_coefficient',
      weightedPoints: null,
    });
  });
});
