import type { LegacyGrade, Grade, GradeResultStatus } from '../types';
import { getLegacyGradeNormalizedValue } from '../utils/legacyGrades';
import { getMention } from './gradingPolicy';
import type { EffectiveClassSubject } from './effectiveClassSubjects';

export interface EvaluationNormalizedScore {
  evaluationId: string;
  originalScore?: number;
  originalMaxScore: number;
  normalizedScore: number | null; // out of 20
  weight: number;
  status: GradeResultStatus | string;
  calculable: boolean;
  reason?: string;
}

export interface SubjectGradeSummary {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  coefficient: number | null;
  evaluations: EvaluationNormalizedScore[];
  evaluationCount: number;
  rawAverage: number | null; // out of 20, non-arrondi
  displayedAverage: string | null; // out of 20, arrondi à 2 décimales
  calculable: boolean;
  weightedPoints: number | null; // average * coefficient
  status: string; // 'valid', 'missing_coefficient', 'no_grades'
  appreciation: string;
}

export interface StudentReportSummary {
  studentId: string;
  subjects: SubjectGradeSummary[];
  generalAverage: number | null;
  totalPoints: number;
  totalCoefficients: number;
  appreciation: string;
  decision: string;
}

export function groupGradesByClassSubject(
  grades: (LegacyGrade | Grade)[],
  effectiveSubjects: EffectiveClassSubject[]
): SubjectGradeSummary[] {
  const summary: SubjectGradeSummary[] = effectiveSubjects.map(sub => ({
    classSubjectId: sub.classSubjectId,
    subjectId: sub.subjectId,
    subjectName: sub.name,
    subjectCode: sub.code,
    coefficient: sub.coefficient !== undefined ? sub.coefficient : null,
    evaluations: [],
    evaluationCount: 0,
    rawAverage: null,
    displayedAverage: null,
    calculable: false,
    weightedPoints: null,
    status: 'no_grades',
    appreciation: '-'
  }));

  const subjectMap = new Map<string, SubjectGradeSummary>();
  summary.forEach(s => subjectMap.set(s.classSubjectId, s));
  
  grades.forEach(g => {
    let targetSummary: SubjectGradeSummary | undefined;
    
    if ('classSubjectId' in g && g.classSubjectId) {
      targetSummary = subjectMap.get(g.classSubjectId);
    } else if (g.subjectId) {
      targetSummary = summary.find(s => s.subjectId === g.subjectId);
    }

    if (targetSummary) {
      const evalScore = calculateEvaluationNormalizedScore(g);
      targetSummary.evaluations.push(evalScore);
      targetSummary.evaluationCount += 1;
    }
  });

  return summary;
}

export function calculateEvaluationNormalizedScore(grade: LegacyGrade | Grade): EvaluationNormalizedScore {
  if ('resultStatus' in grade) {
    const calculable = grade.resultStatus === 'scored' 
      && typeof grade.score === 'number' 
      && typeof grade.maxScore === 'number' 
      && grade.maxScore > 0
      && grade.score <= grade.maxScore;

    let normalizedScore = null;
    
    if (calculable && grade.score !== undefined) {
      normalizedScore = (grade.score / grade.maxScore) * 20;
    }

    return {
      evaluationId: grade.evaluationId,
      originalScore: grade.score,
      originalMaxScore: grade.maxScore,
      normalizedScore,
      weight: 1, 
      status: grade.resultStatus,
      calculable,
      reason: calculable ? undefined : (grade.resultStatus !== 'scored' ? grade.resultStatus : 'invalid_score')
    };
  } else {
    const norm = getLegacyGradeNormalizedValue(grade);
    if (norm.calculable) {
      return {
        evaluationId: grade.id || 'legacy',
        originalScore: norm.originalScore,
        originalMaxScore: norm.originalMaxScore,
        normalizedScore: (norm.originalScore / norm.originalMaxScore) * 20,
        weight: 1,
        status: 'scored',
        calculable: true,
        reason: undefined
      };
    } else {
      return {
        evaluationId: grade.id || 'legacy',
        originalScore: undefined,
        originalMaxScore: 20,
        normalizedScore: null,
        weight: 1,
        status: 'missing',
        calculable: false,
        reason: norm.reason
      };
    }
  }
}

export function calculateSubjectAverage(summary: SubjectGradeSummary): void {
  let totalWeightedScore = 0;
  let totalWeight = 0;
  let hasCalculable = false;

  for (const ev of summary.evaluations) {
    if (ev.calculable && ev.normalizedScore !== null) {
      totalWeightedScore += ev.normalizedScore * ev.weight;
      totalWeight += ev.weight;
      hasCalculable = true;
    }
  }

  if (hasCalculable && totalWeight > 0) {
    summary.rawAverage = totalWeightedScore / totalWeight;
    summary.displayedAverage = roundGradeForDisplay(summary.rawAverage);
    
    if (summary.coefficient === null || summary.coefficient <= 0) {
      summary.calculable = false;
      summary.weightedPoints = null;
      summary.status = 'missing_coefficient';
      summary.appreciation = 'Coefficient non configuré';
    } else {
      summary.calculable = true;
      summary.weightedPoints = summary.rawAverage * summary.coefficient;
      summary.status = 'valid';
      summary.appreciation = getMention(summary.rawAverage);
    }
  } else {
    summary.rawAverage = null;
    summary.displayedAverage = null;
    summary.calculable = false;
    summary.weightedPoints = null;
    summary.status = 'no_grades';
    summary.appreciation = '-';
  }
}

export function calculateWeightedGeneralAverage(subjects: SubjectGradeSummary[]): {
  generalAverage: number | null;
  totalPoints: number;
  totalCoefficients: number;
} {
  let totalPoints = 0;
  let totalCoefficients = 0;
  let hasCalculable = false;

  for (const sub of subjects) {
    if (sub.calculable && sub.rawAverage !== null && sub.coefficient !== null) {
      totalPoints += sub.rawAverage * sub.coefficient;
      totalCoefficients += sub.coefficient;
      hasCalculable = true;
    }
  }

  const generalAverage = hasCalculable && totalCoefficients > 0 ? totalPoints / totalCoefficients : null;

  return { generalAverage, totalPoints, totalCoefficients };
}

export function roundGradeForDisplay(score: number | null): string {
  if (score === null) return 'Non noté';
  return score.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
