import type { LegacyGrade } from '../types';

export type LegacyGradeNormalizedValue = 
  | { calculable: true; value: number; originalScore: number; originalMaxScore: number }
  | { calculable: false; reason: 'missing-score' | 'invalid-score' | 'missing-max-score' | 'invalid-max-score' | 'score-out-of-range' };

export const getLegacyGradeNormalizedValue = (grade: LegacyGrade): LegacyGradeNormalizedValue => {
  if (grade.score === undefined || grade.score === null) {
    return { calculable: false, reason: 'missing-score' };
  }

  const numScore = Number(grade.score);
  if (!Number.isFinite(numScore) || numScore < 0) {
    return { calculable: false, reason: 'invalid-score' };
  }

  if (grade.maxScore === undefined || grade.maxScore === null) {
    return { calculable: false, reason: 'missing-max-score' };
  }

  const numMaxScore = Number(grade.maxScore);
  if (!Number.isFinite(numMaxScore) || numMaxScore <= 0) {
    return { calculable: false, reason: 'invalid-max-score' };
  }

  if (numScore > numMaxScore) {
    return { calculable: false, reason: 'score-out-of-range' };
  }

  return {
    calculable: true,
    value: (numScore / numMaxScore) * 20,
    originalScore: numScore,
    originalMaxScore: numMaxScore
  };
};
