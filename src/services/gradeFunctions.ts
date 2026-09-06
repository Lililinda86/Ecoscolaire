import { getFunctions, httpsCallable } from 'firebase/functions';
import type { Evaluation, Grade } from '../types';

export type EvaluationAction = 'CREATE_DRAFT' | 'UPDATE_DRAFT' | 'OPEN' | 'LOCK' | 'PUBLISH' | 'CANCEL';

export interface ManageEvaluationInput {
  action: EvaluationAction;
  evaluationId: string;
  schoolId?: string;
  academicYearId?: string;
  periodId?: string;
  classId?: string;
  subjectId?: string;
  teacherAssignmentId?: string;
  profile?: {
    title: string;
    type: string;
    date: string;
    maxScore: number;
    weight: number;
    testFixture?: true;
    testRunId?: string;
  };
  expectedVersion?: number;
}

export interface ManageEvaluationOutput {
  success: true;
  changed: boolean;
  evaluation: Evaluation;
}

export class GradesEngineError extends Error {
  businessCode: string;
  constructor(businessCode: string, message: string) {
    super(message);
    this.businessCode = businessCode;
    this.name = 'GradesEngineError';
  }
}

const parseError = (error: unknown, fallback: string): GradesEngineError => {
  const value = error as { details?: { businessCode?: string }; message?: string; code?: string };
  return new GradesEngineError(value.details?.businessCode || value.code || 'INTERNAL_ERROR', value.message || fallback);
};

export async function manageEvaluation(input: ManageEvaluationInput): Promise<ManageEvaluationOutput> {
  const callable = httpsCallable<ManageEvaluationInput, ManageEvaluationOutput>(getFunctions(), 'manageEvaluation');
  try {
    return (await callable(input)).data;
  } catch (error) {
    throw parseError(error, 'Erreur lors de la gestion de l’évaluation.');
  }
}

interface GradeRow {
  studentId: string;
  resultStatus: 'scored' | 'absent' | 'excused' | 'notSubmitted' | 'notEvaluated';
  score?: number;
  comment?: string;
  expectedVersion: number;
}

interface RecordGradesBatchOutput {
  success: true;
  changed: boolean;
  idempotent: boolean;
  count: number;
}

export async function recordGradesBatch(input: {
  schoolId: string;
  evaluationId: string;
  requestId: string;
  rows: GradeRow[];
}): Promise<RecordGradesBatchOutput> {
  const callable = httpsCallable<typeof input, RecordGradesBatchOutput>(getFunctions(), 'recordGradesBatch');
  try {
    return (await callable(input)).data;
  } catch (error) {
    throw parseError(error, 'Erreur lors de l’enregistrement des notes.');
  }
}

export async function saveCanonicalEvaluationGrades(params: {
  evaluation: Evaluation;
  grades: Grade[];
  requestId: string;
}): Promise<void> {
  const { evaluation, grades, requestId } = params;
  let remote = evaluation;
  if (remote.status === 'draft') {
    const created = await manageEvaluation({
      action: 'CREATE_DRAFT', evaluationId: remote.id, schoolId: remote.schoolId,
      academicYearId: remote.academicYearId, periodId: remote.periodId, classId: remote.classId,
      subjectId: remote.subjectId, teacherAssignmentId: remote.teacherAssignmentId,
      profile: {
        title: remote.title, type: remote.type, date: remote.date, maxScore: remote.maxScore, weight: remote.weight,
        ...(remote.testFixture === true ? { testFixture: true, testRunId: remote.testRunId } : {}),
      },
    });
    remote = created.evaluation;
    if (remote.status === 'draft') {
      remote = (await manageEvaluation({ action: 'OPEN', evaluationId: remote.id, schoolId: remote.schoolId, expectedVersion: remote.version })).evaluation;
    }
  }
  if (remote.status !== 'open') throw new GradesEngineError('EVALUATION_NOT_OPEN', 'L’évaluation doit être OPEN pour saisir des notes.');
  await recordGradesBatch({
    schoolId: remote.schoolId,
    evaluationId: remote.id,
    requestId,
    rows: grades.map(grade => ({
      studentId: grade.studentId,
      resultStatus: grade.resultStatus === 'exempt' ? 'excused' : grade.resultStatus,
      ...(grade.resultStatus === 'scored' ? { score: grade.score } : {}),
      ...(grade.comment ? { comment: grade.comment } : {}),
      expectedVersion: Math.max(0, Number(grade.version || 1) - 1),
    })) as GradeRow[],
  });
}
