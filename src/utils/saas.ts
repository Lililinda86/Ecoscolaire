import type { School } from '../types';
import { getConfiguredStudentLimit } from '../services/studentQuota';

/**
 * Returns the maximum number of students allowed for a given school based on its SaaS plan.
 */
export function getStudentLimit(school: School | null): number {
  if (!school) return 0;
  
  return getConfiguredStudentLimit(school);
}

/**
 * Checks if the school has reached its student limit.
 */
export function isStudentLimitReached(school: School | null, currentStudentCount: number): boolean {
  if (!school) return true;
  const limit = getStudentLimit(school);
  return currentStudentCount >= limit;
}

/**
 * Returns a formatted label displaying the current student count and limit.
 */
export function getStudentLimitLabel(school: School | null, currentStudentCount: number): string {
  if (!school) return '';
  
  if (school.isInternalSchool) {
    return `${currentStudentCount} élèves (Interne / Illimité)`;
  }

  const limit = getStudentLimit(school);
  const planName = school.subscriptionPlan 
    ? school.subscriptionPlan.charAt(0).toUpperCase() + school.subscriptionPlan.slice(1)
    : 'Starter';

  if (limit === Infinity) {
    return `${currentStudentCount} élèves (${planName} / Illimité)`;
  }

  return `${currentStudentCount} / ${limit} élèves (${planName})`;
}
