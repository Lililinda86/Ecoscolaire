import type { Grade } from '../types';

export interface GradePartitionResult {
  strictGrades: Grade[];
  legacyGrades: Grade[];
  invalidGrades: unknown[];
}

export const isStrictGradeDocument = (doc: unknown): doc is Grade => {
  if (typeof doc !== 'object' || doc === null) return false;
  const d = doc as Record<string, unknown>;
  const rStatus = d.resultStatus as string;
  const isScored = rStatus === 'scored';
  const hasValidStatus = ['scored', 'absent', 'excused', 'exempt', 'notSubmitted'].includes(rStatus);
  
  return (
    typeof d.id === 'string' && d.id !== '' &&
    typeof d.schoolId === 'string' && d.schoolId !== '' &&
    typeof d.academicYearId === 'string' && d.academicYearId !== '' &&
    typeof d.periodId === 'string' && d.periodId !== '' &&
    typeof d.evaluationId === 'string' && d.evaluationId !== '' &&
    typeof d.classId === 'string' && d.classId !== '' &&
    typeof d.classSubjectId === 'string' && d.classSubjectId !== '' &&
    typeof d.subjectId === 'string' && d.subjectId !== '' &&
    typeof d.studentId === 'string' && d.studentId !== '' &&
    typeof d.teacherId === 'string' && d.teacherId !== '' &&
    (d.status === 'draft' || d.status === 'validated' || d.status === 'locked') &&
    hasValidStatus &&
    typeof d.maxScore === 'number' && Number.isFinite(d.maxScore) && d.maxScore > 0 &&
    typeof d.createdAt === 'string' && d.createdAt !== '' &&
    typeof d.createdBy === 'string' && d.createdBy !== '' &&
    typeof d.updatedAt === 'string' && d.updatedAt !== '' &&
    typeof d.updatedBy === 'string' && d.updatedBy !== '' &&
    typeof d.version === 'number' && Number.isInteger(d.version) && d.version > 0 &&
    (isScored 
      ? (typeof d.score === 'number' && Number.isFinite(d.score) && d.score >= 0 && d.score <= (d.maxScore as number))
      : d.score === undefined)
  );
};

export const isLegacyGradeDocument = (doc: unknown): doc is Grade => {
  if (typeof doc !== 'object' || doc === null) return false;
  const d = doc as Record<string, unknown>;
  return (
    typeof d.id === 'string' &&
    typeof d.schoolId === 'string' &&
    typeof d.studentId === 'string' &&
    typeof d.classId === 'string' &&
    typeof d.subject === 'string' &&
    typeof d.value === 'number' &&
    typeof d.date === 'string' &&
    d.evaluationId === undefined &&
    d.academicYearId === undefined &&
    d.periodId === undefined
  );
};

export const partitionGradeDocuments = (documents: unknown[]): GradePartitionResult => {
  const result: GradePartitionResult = {
    strictGrades: [],
    legacyGrades: [],
    invalidGrades: []
  };

  if (!Array.isArray(documents)) {
    return result;
  }

  for (const doc of documents) {
    const isStrict = isStrictGradeDocument(doc);
    const isLegacy = isLegacyGradeDocument(doc);

    if (isStrict && !isLegacy) {
      result.strictGrades.push(doc);
    } else if (isLegacy && !isStrict) {
      result.legacyGrades.push(doc);
    } else {
      result.invalidGrades.push(doc);
    }
  }

  return result;
};

