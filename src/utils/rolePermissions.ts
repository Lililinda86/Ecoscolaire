import type { GlobalRole } from '../types';

export type Capability =
  | 'dashboard.read'
  | 'students.read'
  | 'students.write'
  | 'students.export'
  | 'classes.read'
  | 'classes.write'
  | 'subjects.read'
  | 'subjects.write'
  | 'grades.read'
  | 'grades.write'
  | 'attendance.read'
  | 'attendance.write'
  | 'staff.read'
  | 'staff.write'
  | 'finance.read'
  | 'finance.write'
  | 'transport.read'
  | 'transport.write'
  | 'inventory.read'
  | 'inventory.write'
  | 'reports.read'
  | 'validation.read'
  | 'validation.decide'
  | 'settings.read'
  | 'settings.write';

const BOARD_VIEWER_CAPABILITIES: Capability[] = [
  'dashboard.read',
  'students.read',
  'classes.read',
  'subjects.read',
  'grades.read',
  'attendance.read',
  'staff.read',
  'finance.read',
  'transport.read',
  'inventory.read',
  'reports.read',
  'validation.read'
];

const TEACHER_CAPABILITIES: Capability[] = [
  'dashboard.read',
  'students.read',
  'classes.read',
  'subjects.read',
  'grades.read',
  'grades.write',
  'attendance.read',
  'attendance.write'
];

const DRIVER_CAPABILITIES: Capability[] = [
  'transport.read',
  'transport.write'
];

export function hasCapability(role: GlobalRole | string | undefined | null, capability: Capability): boolean {
  if (!role) return false;
  if (role === 'superAdmin' || role === 'owner' || role === 'director') return true;

  if (role === 'secretary') {
    // Secretary can do most things except sensitive finance or settings
    if (capability.startsWith('finance.') || capability.startsWith('settings.')) return false;
    return true;
  }

  if (role === 'accountant') {
    if (capability.startsWith('finance.')) return true;
    if (capability === 'dashboard.read' || capability === 'students.read') return true;
    return false;
  }

  if (role === 'teacher') {
    return TEACHER_CAPABILITIES.includes(capability);
  }

  if (role === 'driver') {
    return DRIVER_CAPABILITIES.includes(capability);
  }

  if (role === 'boardViewer') {
    return BOARD_VIEWER_CAPABILITIES.includes(capability);
  }

  return false;
}

export function isReadOnlyRole(role: GlobalRole | string | undefined | null): boolean {
  return role === 'boardViewer'; 
}

export function isBoardViewer(role: GlobalRole | string | undefined | null): boolean {
  return role === 'boardViewer';
}
