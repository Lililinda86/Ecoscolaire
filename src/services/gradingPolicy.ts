export interface GradingPolicy {
  id?: string;
  schoolId?: string;
  name?: string;
  defaultMaxScore: number;
}

export function getMention(average: number | null): string {
  if (average === null) return '-';
  if (average >= 18) return 'Excellent';
  if (average >= 16) return 'Très bien';
  if (average >= 14) return 'Bien';
  if (average >= 12) return 'Assez bien';
  if (average >= 10) return 'Passable';
  return 'Insuffisant';
}

export function getDefaultGradingPolicy(): GradingPolicy {
  return {
    defaultMaxScore: 20
  };
}

export function validateGradingPolicy(policy: GradingPolicy): boolean {
  if (!policy || typeof policy.defaultMaxScore !== 'number' || policy.defaultMaxScore <= 0) {
    return false;
  }
  return true;
}
