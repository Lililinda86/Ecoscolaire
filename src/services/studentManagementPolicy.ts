import type { Student } from '../types';

const STUDENT_MANAGER_ROLES = new Set(['superAdmin', 'owner', 'director', 'secretary']);

export const canRoleManageStudents = (role: unknown): boolean =>
  typeof role === 'string' && STUDENT_MANAGER_ROLES.has(role.trim());

export const canRoleChangeStudentStatus = canRoleManageStudents;

export const validateRequiredStudentFields = (
  student: Partial<Student>,
  today = new Date()
): string | null => {
  if (!student.studentLastName?.trim()) return 'Veuillez renseigner le nom.';
  if (!student.studentFirstName?.trim()) return 'Veuillez renseigner le ou les prénoms.';
  if (student.gender !== 'M' && student.gender !== 'F') return 'Veuillez renseigner le sexe.';
  if (!student.dob) return 'Veuillez renseigner la date de naissance.';
  if (new Date(`${student.dob}T00:00:00`) > today) return 'La date de naissance ne peut pas être dans le futur.';
  if (!student.classId) return 'Veuillez sélectionner une classe.';
  if (!student.parentName?.trim()) return 'Veuillez renseigner le nom du responsable légal.';
  if (!student.parentPhone?.trim()) return 'Veuillez renseigner le téléphone du responsable légal.';
  return null;
};

const CREATION_ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: 'Votre session a expiré. Veuillez vous reconnecter.',
  PERMISSION_DENIED: 'Vous n’avez pas l’autorisation de créer un élève.',
  STUDENT_COUNTER_NOT_INITIALIZED: 'Le compteur d’élèves actifs doit être initialisé avant toute création.',
  STUDENT_QUOTA_REACHED: 'La capacité autorisée pour les élèves actifs est atteinte.',
  QUOTA_EXCEEDED: 'La capacité autorisée pour les élèves actifs est atteinte.',
  MATRICULE_ALREADY_EXISTS: 'Ce matricule est déjà utilisé dans cette école.',
  AUTOMATIC_MATRICULE_EXHAUSTED: 'Aucun matricule automatique unique n’a pu être réservé. Veuillez réessayer.',
  ACTIVE_ACADEMIC_YEAR_REQUIRED: 'Aucune année académique active valide n’est configurée pour cette école.',
  INVALID_ACADEMIC_YEAR: 'L’année académique active est absente ou invalide.',
  INVALID_CLASS: 'La classe sélectionnée est inactive, introuvable ou rattachée à une autre école.',
  STUDENT_ID_CONFLICT: 'Cette saisie est déjà enregistrée. Fermez le formulaire puis recommencez.'
};

export const getStudentCreationErrorMessage = (businessCode: string): string | null =>
  CREATION_ERROR_MESSAGES[businessCode] ?? null;

const STATUS_ERROR_MESSAGES: Record<string, string> = {
  STUDENT_QUOTA_REACHED: 'Réactivation impossible : la capacité autorisée pour les élèves actifs est atteinte.',
  STUDENT_COUNTER_NOT_INITIALIZED: 'Action impossible : le compteur d’élèves actifs doit être initialisé.',
  STUDENT_COUNTER_INCONSISTENT: 'Action impossible : le compteur d’élèves actifs doit être vérifié.',
  STUDENT_NOT_FOUND: 'Action impossible : cet élève est introuvable.',
  SCHOOL_NOT_FOUND: 'Action impossible : cette école est introuvable.',
  CROSS_SCHOOL_STUDENT: 'Action impossible : cet élève n’appartient pas à l’école active.'
};

export const getStudentStatusErrorMessage = (businessCode: string): string =>
  STATUS_ERROR_MESSAGES[businessCode]
  ?? 'Le changement de statut a échoué. Veuillez réessayer.';
