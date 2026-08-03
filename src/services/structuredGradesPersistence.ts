import { Firestore, doc, writeBatch } from 'firebase/firestore';
import type { Evaluation, Grade } from '../types';
import { buildGradeId } from '../utils/gradeIds';

export class StructuredGradeSaveCancelledError extends Error {
  constructor() {
    super("Enregistrement annulé par l'utilisateur (Mode Supervision).");
    this.name = "StructuredGradeSaveCancelledError";
  }
}

export interface SaveStructuredGradesParams {
  firestore: Firestore;
  evaluation: Evaluation;
  grades: Grade[];
}

export const saveStructuredEvaluationGrades = async ({
  firestore,
  evaluation,
  grades
}: SaveStructuredGradesParams): Promise<void> => {
  if (!evaluation.id) throw new Error("Evaluation ID is required");
  if (!evaluation.schoolId) throw new Error("Evaluation schoolId is required");
  if (!Number.isFinite(evaluation.maxScore) || evaluation.maxScore <= 0) throw new Error("Invalid maxScore on evaluation");
  if (!Number.isFinite(evaluation.weight) || evaluation.weight <= 0) throw new Error("Invalid weight on evaluation");
  
  if (grades.length === 0) return;

  // Validate coherence
  const studentIds = new Set<string>();
  const gradeIds = new Set<string>();

  for (const grade of grades) {
    if (!grade.id) throw new Error("Grade ID is required");
    
    if (studentIds.has(grade.studentId)) {
      throw new Error("Multiple grades for the same student in this evaluation payload");
    }
    studentIds.add(grade.studentId);
    
    if (gradeIds.has(grade.id)) {
      throw new Error("Collision d'ID détectée dans les notes");
    }
    gradeIds.add(grade.id);

    if (grade.id !== buildGradeId(evaluation.id, grade.studentId)) throw new Error("Invalid grade ID format");
    if (grade.schoolId !== evaluation.schoolId) throw new Error("Inconsistent schoolId between grade and evaluation");
    if (grade.academicYearId !== evaluation.academicYearId) throw new Error("Inconsistent academicYearId between grade and evaluation");
    if (grade.periodId !== evaluation.periodId) throw new Error("Inconsistent periodId between grade and evaluation");
    if (grade.classSubjectId !== evaluation.classSubjectId) throw new Error("Inconsistent classSubjectId between grade and evaluation");
    if (grade.classId !== evaluation.classId) throw new Error("Inconsistent classId between grade and evaluation");
    if (grade.subjectId !== evaluation.subjectId) throw new Error("Inconsistent subjectId between grade and evaluation");
    if (grade.teacherId !== evaluation.teacherId) throw new Error("Inconsistent teacherId between grade and evaluation");
    if (grade.evaluationId !== evaluation.id) throw new Error("Inconsistent evaluationId in grade");
    if (grade.maxScore !== evaluation.maxScore) throw new Error("Inconsistent maxScore between grade and evaluation");
  }

  // Firebase Batch allows max 500 operations
  // 1 evaluation + N grades. We check if N + 1 > 500
  if (grades.length + 1 > 500) {
    throw new Error("Le nombre de notes dépasse la limite technique d'un enregistrement unique (500).");
  }

  const batch = writeBatch(firestore);

  // Write evaluation (upsert)
  const evalRef = doc(firestore, 'evaluations', evaluation.id);
  batch.set(evalRef, evaluation);

  // Write grades
  for (const grade of grades) {
    const gradeRef = doc(firestore, 'grades', grade.id);
    batch.set(gradeRef, grade);
  }

  // Commit batch
  await batch.commit();
};
