import type { TeachingPlanStatus } from '../types';

export const editableStatuses: TeachingPlanStatus[] = ['draft', 'proposed', 'needs_adjustment', 'adjusted'];
export const canEditTeachingPlan = (status: TeachingPlanStatus): boolean => editableStatuses.includes(status);
export const canValidateTeachingPlan = (status: TeachingPlanStatus): boolean => ['proposed', 'needs_adjustment', 'adjusted'].includes(status);
export const canArchiveTeachingPlan = (status: TeachingPlanStatus): boolean => status === 'teacher_validated';

export const pedagogyStatusLabel: Record<TeachingPlanStatus, string> = {
  draft: 'Brouillon',
  proposed: 'Proposé',
  needs_adjustment: 'À ajuster',
  adjusted: 'Ajusté',
  teacher_validated: 'Validé par l’enseignant',
  archived: 'Archivé'
};
