// Utilitaire pour la création d'IDs déterministes pour le module académique
// On utilise encodeURIComponent pour éviter toute collision liée au remplacement simple.

function safeEncode(val: string): string {
  if (!val || val.trim() === '') {
    throw new Error('Segment vide interdit pour la génération d\'ID');
  }
  return encodeURIComponent(val);
}

export const buildAcademicYearId = (schoolId: string, name: string): string => {
  return "ay__" + safeEncode(schoolId) + "__" + safeEncode(name);
};

export const buildPeriodId = (schoolId: string, academicYearId: string, name: string): string => {
  return "prd__" + safeEncode(schoolId) + "__" + safeEncode(academicYearId) + "__" + safeEncode(name);
};

export const buildEvaluationId = (schoolId: string, academicYearId: string, classSubjectId: string, title: string): string => {
  return "ev__" + safeEncode(schoolId) + "__" + safeEncode(academicYearId) + "__" + safeEncode(classSubjectId) + "__" + safeEncode(title);
};

export const buildGradeId = (evaluationId: string, studentId: string): string => {
  return "gr__" + safeEncode(evaluationId) + "__" + safeEncode(studentId);
};
