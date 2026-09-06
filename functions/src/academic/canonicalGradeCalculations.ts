export type CanonicalGradeResultStatus = 'scored' | 'absent' | 'excused' | 'notSubmitted' | 'notEvaluated' | 'missing';

export interface CanonicalEvaluationScore {
  evaluationId: string;
  originalScore?: number;
  originalMaxScore: number;
  normalizedScore: number | null;
  weight: number;
  status: CanonicalGradeResultStatus | string;
  calculable: boolean;
  reason?: string;
}

export interface CanonicalSubjectCalculation {
  rawAverage: number | null;
  displayedAverage: string | null;
  calculable: boolean;
  weightedPoints: number | null;
  status: 'valid' | 'missing_coefficient' | 'no_grades';
}

export interface CanonicalGeneralCalculation {
  generalAverage: number | null;
  totalPoints: number;
  totalCoefficients: number;
}

export const normalizeCanonicalGrade = (input: {
  evaluationId: string;
  resultStatus: CanonicalGradeResultStatus | string;
  score?: number;
  maxScore: number;
  weight?: number;
}): CanonicalEvaluationScore => {
  const calculable = input.resultStatus === 'scored'
    && typeof input.score === 'number'
    && Number.isFinite(input.score)
    && typeof input.maxScore === 'number'
    && Number.isFinite(input.maxScore)
    && input.maxScore > 0
    && input.score >= 0
    && input.score <= input.maxScore;
  const weight = typeof input.weight === 'number' && Number.isFinite(input.weight) && input.weight > 0
    ? input.weight
    : 1;
  return {
    evaluationId: input.evaluationId,
    ...(typeof input.score === 'number' && Number.isFinite(input.score) ? { originalScore: input.score } : {}),
    originalMaxScore: input.maxScore,
    normalizedScore: calculable && input.score !== undefined ? (input.score / input.maxScore) * 20 : null,
    weight,
    status: input.resultStatus,
    calculable,
    ...(calculable ? {} : { reason: input.resultStatus !== 'scored' ? input.resultStatus : 'invalid_score' }),
  };
};

export const calculateCanonicalSubject = (
  evaluations: CanonicalEvaluationScore[],
  coefficient: number | null,
): CanonicalSubjectCalculation => {
  let totalWeightedScore = 0;
  let totalWeight = 0;
  for (const evaluation of evaluations) {
    if (evaluation.calculable && evaluation.normalizedScore !== null) {
      totalWeightedScore += evaluation.normalizedScore * evaluation.weight;
      totalWeight += evaluation.weight;
    }
  }
  if (totalWeight === 0) {
    return { rawAverage: null, displayedAverage: null, calculable: false, weightedPoints: null, status: 'no_grades' };
  }
  const rawAverage = totalWeightedScore / totalWeight;
  if (coefficient === null || !Number.isFinite(coefficient) || coefficient <= 0) {
    return {
      rawAverage,
      displayedAverage: roundCanonicalGradeForDisplay(rawAverage),
      calculable: false,
      weightedPoints: null,
      status: 'missing_coefficient',
    };
  }
  return {
    rawAverage,
    displayedAverage: roundCanonicalGradeForDisplay(rawAverage),
    calculable: true,
    weightedPoints: rawAverage * coefficient,
    status: 'valid',
  };
};

export const calculateCanonicalGeneral = (subjects: Array<{
  calculable: boolean;
  rawAverage: number | null;
  coefficient: number | null;
}>): CanonicalGeneralCalculation => {
  let totalPoints = 0;
  let totalCoefficients = 0;
  for (const subject of subjects) {
    if (subject.calculable && subject.rawAverage !== null && subject.coefficient !== null) {
      totalPoints += subject.rawAverage * subject.coefficient;
      totalCoefficients += subject.coefficient;
    }
  }
  return {
    generalAverage: totalCoefficients > 0 ? totalPoints / totalCoefficients : null,
    totalPoints,
    totalCoefficients,
  };
};

export const roundCanonicalGradeForDisplay = (score: number | null): string | null =>
  score === null ? null : score.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
