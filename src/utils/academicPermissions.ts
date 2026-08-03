export function canManageAcademicPrograms(role?: string | null): boolean {
  return (
    role === 'superAdmin' ||
    role === 'owner' ||
    role === 'director' ||
    role === 'secretary'
  );
}
