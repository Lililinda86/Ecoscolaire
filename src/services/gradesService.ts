import type { Grade, LegacyGrade, LegacyGradeAnalysis, CreateGradeInput, UpdateGradeInput } from '../types';

export const validateGradeInput = (grade: Partial<Grade>): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!grade.id) errors.push('L\'identifiant de la note est requis (id).');
  if (!grade.schoolId) errors.push('L\'identifiant de l\'école est requis (schoolId).');
  if (!grade.academicYearId) errors.push('L\'année académique est requise (academicYearId).');
  if (!grade.periodId) errors.push('La période est requise (periodId).');
  if (!grade.evaluationId) errors.push('L\'évaluation est requise (evaluationId).');
  if (!grade.classId) errors.push('La classe est requise (classId).');
  if (!grade.classSubjectId) errors.push('La matière de la classe est requise (classSubjectId).');
  if (!grade.subjectId) errors.push('La matière est requise (subjectId).');
  if (!grade.studentId) errors.push('L\'élève est requis (studentId).');
  if (!grade.teacherId) errors.push('L\'enseignant est requis (teacherId).');
  if (!grade.status) errors.push('Le statut est requis (status).');
  if (!grade.resultStatus) errors.push('Le statut de résultat est requis (resultStatus).');
  if (!grade.createdAt) errors.push('La date de création est requise (createdAt).');
  if (!grade.createdBy) errors.push('Le créateur est requis (createdBy).');
  if (!grade.updatedAt) errors.push('La date de mise à jour est requise (updatedAt).');
  if (!grade.updatedBy) errors.push('L\'auteur de la mise à jour est requis (updatedBy).');

  if (typeof grade.maxScore !== 'number' || !Number.isFinite(grade.maxScore) || grade.maxScore <= 0) {
    errors.push('La note maximale doit être un nombre strictement positif (maxScore).');
  }

  if (typeof grade.version !== 'number' || !Number.isInteger(grade.version) || grade.version < 1) {
    errors.push('La version doit être un entier positif.');
  }

  if (grade.resultStatus === 'scored') {
    if (grade.score === undefined || grade.score === null) {
      errors.push('Le score est obligatoire lorsque le statut est "Noté" (scored).');
    } else if (typeof grade.score !== 'number' || !Number.isFinite(grade.score)) {
      errors.push('Le score doit être un nombre fini.');
    } else if (grade.score < 0 || grade.score > (grade.maxScore || 0)) {
      errors.push('Le score doit être compris entre 0 et la note maximale.');
    }
  } else if (['absent', 'excused', 'exempt', 'notSubmitted'].includes(grade.resultStatus || '')) {
    if (grade.score !== undefined) {
      errors.push('Le score ne doit pas être renseigné pour ce statut de résultat.');
    }
  } else if (grade.resultStatus) {
    errors.push('Le statut de résultat est inconnu.');
  }

  if (grade.status && !['draft', 'submitted', 'validated', 'published', 'locked'].includes(grade.status)) {
    errors.push('Le statut de la note est inconnu.');
  }

  return { isValid: errors.length === 0, errors };
};

export const analyzeLegacyGrade = (legacy: LegacyGrade): LegacyGradeAnalysis => {
  const missingFields: string[] = [];
  const warnings: string[] = [];

  if (!legacy.schoolId) missingFields.push('schoolId');
  if (!legacy.maxScore) missingFields.push('maxScore');
  if (!legacy.studentId) missingFields.push('studentId');
  if (!legacy.subjectId) missingFields.push('subjectId');
  
  // Year and period are always missing from legacy format as per audit
  missingFields.push('academicYearId', 'periodId', 'evaluationId', 'classId', 'classSubjectId', 'teacherId');

  if (legacy.score !== undefined && legacy.maxScore !== undefined) {
    if (legacy.score > legacy.maxScore) {
      warnings.push('Score est supérieur à la note maximale.');
    }
  }

  return {
    grade: legacy,
    isMigratable: false, // Cannot migrate without human intervention or AI mapping for missing fields
    missingFields,
    warnings,
    legacy: true
  };
};

export const buildGradeCreateMutation = (input: CreateGradeInput, actorId: string, now: string = new Date().toISOString()): Grade => {
  return {
    id: input.evaluationId + '__' + input.studentId, // Note: deterministic IDs handled externally, but fallback here
    ...input,
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
    updatedBy: actorId,
    version: 1
  };
};

export const buildGradeUpdateMutation = (existing: Grade, input: UpdateGradeInput, actorId: string, now: string = new Date().toISOString()): Grade => {
  if (input.expectedVersion !== existing.version) {
    throw new Error('Conflit de version détecté (expectedVersion != existante).');
  }

  const updated: Grade = {
    ...existing,
    updatedAt: now,
    updatedBy: actorId,
    version: existing.version + 1
  };

  if (input.resultStatus !== undefined) updated.resultStatus = input.resultStatus;
  if (input.status !== undefined) updated.status = input.status;
  if (input.comment !== undefined) updated.comment = input.comment;
  
  if (input.score !== undefined) {
    updated.score = input.score;
  } else if (updated.resultStatus !== 'scored') {
    delete updated.score;
  }

  return updated;
};

export const mapGradeError = (errorCode: string): string => {
  switch (errorCode) {
    case 'permission-denied': return "Vous n'avez pas l'autorisation de modifier cette note.";
    case 'not-found': return "Note introuvable.";
    default: return "Une erreur est survenue lors de l'enregistrement de la note.";
  }
};
