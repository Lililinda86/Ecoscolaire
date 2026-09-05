export type TeachingPlanStatus = 'draft' | 'proposed' | 'needs_adjustment' | 'adjusted' | 'teacher_validated' | 'archived';
export type TeachingPlanItemStatus = 'planned' | 'adjusted' | 'teacher_validated' | 'cancelled';

const transitions: Record<TeachingPlanStatus, TeachingPlanStatus[]> = {
  draft: ['proposed'],
  proposed: ['needs_adjustment', 'adjusted', 'teacher_validated'],
  needs_adjustment: ['adjusted', 'teacher_validated'],
  adjusted: ['needs_adjustment', 'teacher_validated'],
  teacher_validated: ['archived'],
  archived: []
};

export const canTransitionTeachingPlan = (from: TeachingPlanStatus, to: TeachingPlanStatus): boolean => transitions[from].includes(to);
