import { describe, it, expect } from 'vitest';
import { getLegacyGradeNormalizedValue } from '../../src/utils/legacyGrades';
import type { LegacyGrade } from '../../src/types';

describe('legacyGrades', () => {
  it('score undefined returns missing-score', () => {
    const res = getLegacyGradeNormalizedValue({ score: undefined, maxScore: 20 } as LegacyGrade);
    expect(res).toEqual({ calculable: false, reason: 'missing-score' });
  });

  it('score NaN returns invalid-score', () => {
    const res = getLegacyGradeNormalizedValue({ score: NaN, maxScore: 20 } as LegacyGrade);
    expect(res).toEqual({ calculable: false, reason: 'invalid-score' });
  });

  it('score Infinity returns invalid-score', () => {
    const res = getLegacyGradeNormalizedValue({ score: Infinity, maxScore: 20 } as LegacyGrade);
    expect(res).toEqual({ calculable: false, reason: 'invalid-score' });
  });

  it('score negatif returns invalid-score', () => {
    const res = getLegacyGradeNormalizedValue({ score: -1, maxScore: 20 } as LegacyGrade);
    expect(res).toEqual({ calculable: false, reason: 'invalid-score' });
  });

  it('score supérieur au max returns score-out-of-range', () => {
    const res = getLegacyGradeNormalizedValue({ score: 25, maxScore: 20 } as LegacyGrade);
    expect(res).toEqual({ calculable: false, reason: 'score-out-of-range' });
  });

  it('maxScore undefined returns missing-max-score', () => {
    const res = getLegacyGradeNormalizedValue({ score: 10, maxScore: undefined } as LegacyGrade);
    expect(res).toEqual({ calculable: false, reason: 'missing-max-score' });
  });

  it('maxScore NaN returns invalid-max-score', () => {
    const res = getLegacyGradeNormalizedValue({ score: 10, maxScore: NaN } as LegacyGrade);
    expect(res).toEqual({ calculable: false, reason: 'invalid-max-score' });
  });

  it('maxScore nul returns invalid-max-score', () => {
    const res = getLegacyGradeNormalizedValue({ score: 10, maxScore: 0 } as LegacyGrade);
    expect(res).toEqual({ calculable: false, reason: 'invalid-max-score' });
  });

  it('note valide', () => {
    const res = getLegacyGradeNormalizedValue({ score: 15, maxScore: 20 } as LegacyGrade);
    expect(res).toEqual({
      calculable: true,
      value: 15,
      originalScore: 15,
      originalMaxScore: 20
    });
  });

  it('aucun resultat calculable ne contient NaN', () => {
    const res = getLegacyGradeNormalizedValue({ score: 0, maxScore: 20 } as LegacyGrade);
    if (res.calculable) {
      expect(Number.isNaN(res.value)).toBe(false);
    }
  });
});
