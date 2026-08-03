// Utilitaire pour la création d'IDs déterministes pour le module académique
// On utilise encodeURIComponent pour éviter toute collision liée au remplacement simple.

function safeEncode(val: string): string {
  if (!val || val.trim() === '') {
    throw new Error('Segment vide interdit pour la génération d\'ID');
  }
  return encodeURIComponent(val);
}

export const buildAcademicYearId = (schoolId: string, startDate: string, endDate: string): string => {
  const normStart = startDate.split('T')[0];
  const normEnd = endDate.split('T')[0];
  return "ay__" + safeEncode(schoolId) + "__" + safeEncode(normStart) + "__" + safeEncode(normEnd);
};

export const buildPeriodId = (academicYearId: string, order: number | string): string => {
  return "prd__" + safeEncode(academicYearId) + "__" + safeEncode(String(order));
};

export const buildEvaluationId = (schoolId: string, academicYearId: string, periodId: string, classId: string, classSubjectId: string, evalKey: string): string => {
  return "ev__" + safeEncode(schoolId) + "__" + safeEncode(academicYearId) + "__" + safeEncode(periodId) + "__" + safeEncode(classId) + "__" + safeEncode(classSubjectId) + "__" + safeEncode(evalKey);
};

export const buildGradeId = (evaluationId: string, studentId: string): string => {
  return "gr__" + safeEncode(evaluationId) + "__" + safeEncode(studentId);
};
