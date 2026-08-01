import type { Staff } from '../types';

export function getEffectiveStaffType(staff: Staff | Partial<Staff>): string {
  if (staff.staffType) return staff.staffType;
  if (staff.role) return staff.role;
  if (staff.position) return staff.position;
  return 'other';
}

export function getEffectiveEmploymentStatus(staff: Staff | Partial<Staff>): string {
  if (staff.employmentStatus) return staff.employmentStatus;

  if (staff.isActive === false || staff.active === false) {
    return 'inactive';
  }
  if (staff.status) {
    const s = staff.status.toLowerCase();
    if (s === 'actif' || s === 'active') return 'active';
    if (s === 'absent' || s === 'remplacé' || s === 'inactive') return 'inactive'; // Mapping legacy
  }
  if (staff.isActive === true || staff.active === true) {
    return 'active';
  }

  // Default fallback if nothing is set
  return 'inactive';
}

export function getStaffDisplayName(staff: Staff | Partial<Staff>): string {
  if (staff.firstName || staff.lastName) {
    const parts = [];
    if (staff.lastName) parts.push(staff.lastName.trim());
    if (staff.firstName) parts.push(staff.firstName.trim());
    return parts.join(' ');
  }
  if (staff.name) {
    return staff.name.trim();
  }
  return 'Personnel inconnu';
}

export function isStaffEligibleForTeaching(staff: Staff | Partial<Staff>, schoolId: string): boolean {
  if (!staff.id) return false;
  if (staff.schoolId !== schoolId) return false;

  const status = getEffectiveEmploymentStatus(staff);
  if (status !== 'active') return false;

  const type = getEffectiveStaffType(staff);
  if (type === 'teacher') return true;
  if (staff.teachingEnabled === true) return true;

  return false;
}
