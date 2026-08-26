import type { LegacyGrade, Grade, GradeResultStatus, Evaluation } from '../types';
import { getLegacyGradeNormalizedValue } from '../utils/legacyGrades';
import type { EffectiveClassSubject } from './effectiveClassSubjects';
import {
  calculateCanonicalGeneral,
  calculateCanonicalSubject,
  normalizeCanonicalGrade,
  roundCanonicalGradeForDisplay,
  type CanonicalEvaluationScore,
} from '../../functions/src/academic/canonicalGradeCalculations';

export interface EvaluationNormalizedScore extends CanonicalEvaluationScore {
  status: GradeResultStatus | string;
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
  effectiveSubjects: EffectiveClassSubject[],
  evaluations?: Evaluation[]
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
  
  const evaluationMap = new Map((evaluations || []).map(evaluation => [evaluation.id, evaluation]));
  grades.forEach(g => {
    const evaluation = 'evaluationId' in g ? evaluationMap.get(g.evaluationId) : undefined;
    if (evaluations && 'evaluationId' in g && evaluation?.status !== 'published') return;
    let targetSummary: SubjectGradeSummary | undefined;
    
    if ('classSubjectId' in g && g.classSubjectId) {
      targetSummary = subjectMap.get(g.classSubjectId);
    } else if (g.subjectId) {
      targetSummary = summary.find(s => s.subjectId === g.subjectId);
    }

    if (targetSummary) {
      const evalScore = calculateEvaluationNormalizedScore(g, evaluation);
      targetSummary.evaluations.push(evalScore);
      targetSummary.evaluationCount += 1;
    }
  });

  return summary;
}

export function calculateEvaluationNormalizedScore(grade: LegacyGrade | Grade, evaluation?: Evaluation): EvaluationNormalizedScore {
  if ('resultStatus' in grade) {
    return normalizeCanonicalGrade({
      evaluationId: grade.evaluationId,
      resultStatus: grade.resultStatus,
      score: grade.score,
      maxScore: grade.maxScore,
      weight: evaluation?.weight || 1,
    });
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
  const calculated = calculateCanonicalSubject(summary.evaluations, summary.coefficient);
  Object.assign(summary, calculated, {
    appreciation: calculated.status === 'missing_coefficient' ? 'Coefficient non configuré' : '-',
  });
}

export function calculateWeightedGeneralAverage(subjects: SubjectGradeSummary[]): {
  generalAverage: number | null;
  totalPoints: number;
  totalCoefficients: number;
} {
  return calculateCanonicalGeneral(subjects);
}

export function roundGradeForDisplay(score: number | null): string {
  return roundCanonicalGradeForDisplay(score) || 'Non noté';
}
