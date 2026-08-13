import type { GlobalRole } from '../types';

const OPERATIONAL_STAFF_ROLES: GlobalRole[] = ['director', 'secretary', 'accountant', 'teacher', 'driver'];

export const getCreatableRoles = (actorRole: GlobalRole): GlobalRole[] => {
  if (actorRole === 'owner' || actorRole === 'superAdmin') return [...OPERATIONAL_STAFF_ROLES];
  if (actorRole === 'director') return OPERATIONAL_STAFF_ROLES.filter(role => role !== 'director');
  return [];
};
