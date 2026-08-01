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

export function buildStaffWritePayload(
  form: Partial<Staff>,
  currentSchool: { id: string },
  currentUser: { id: string } | null,
  isEdit: boolean
): Omit<Staff, 'id'> {
  const now = new Date().toISOString();
  
  const payload: Partial<Staff> = {
    schoolId: currentSchool.id,
    firstName: form.firstName?.trim() || '',
    lastName: form.lastName?.trim() || '',
    staffType: form.staffType || 'other',
    employmentStatus: form.employmentStatus || 'active',
  };

  if (form.phone) payload.phone = form.phone.trim();
  if (form.email) payload.email = form.email.trim();
  if (form.teachingEnabled !== undefined) payload.teachingEnabled = form.teachingEnabled;
  if (form.hireDate) payload.hireDate = form.hireDate;
  
  if (payload.employmentStatus === 'departed') {
    if (form.departureDate) payload.departureDate = form.departureDate;
    if (form.departureReason) payload.departureReason = form.departureReason;
  }

  if (isEdit) {
    payload.updatedAt = now;
    if (currentUser) payload.updatedBy = currentUser.id;
  } else {
    payload.createdAt = now;
    payload.updatedAt = now;
    if (currentUser) {
      payload.createdBy = currentUser.id;
      payload.updatedBy = currentUser.id;
    }
  }

  return payload as Omit<Staff, 'id'>;
}
