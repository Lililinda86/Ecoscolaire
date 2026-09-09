import { resolveCanonicalClassCycle } from './classCycle';

export interface FeeTargetClass {
  id: string; schoolId?: string; name: string; cycle?: string; level?: string;
  type?: string; catalogLevelId?: string; academicYearId?: string; isActive?: boolean;
}
export interface FeeTargetStudent {
  id: string; schoolId?: string; classId?: string; academicYearId?: string;
  schoolingStatus?: string; isActive?: boolean; active?: boolean; status?: string;
}
export function activeFeeClass(c: FeeTargetClass, schoolId: string, yearId?: string): boolean {
  return c.schoolId === schoolId && c.isActive !== false && (!c.academicYearId || c.academicYearId === yearId);
}
export function activeFeeStudent(s: FeeTargetStudent, schoolId: string, yearId?: string): boolean {
  return s.schoolId === schoolId && s.schoolingStatus !== 'inactive' && s.isActive !== false && s.active !== false && s.status !== 'inactive'
    && (!yearId || s.academicYearId === yearId);
}
export function feeClassCycle(c: FeeTargetClass) {
  return resolveCanonicalClassCycle({ ...c });
}
export function feeTargetClasses<T extends FeeTargetClass>(classes: T[], schoolId: string, yearId: string | undefined, cycles: string[]): T[] {
  return [...new Map(classes.filter(c => activeFeeClass(c, schoolId, yearId) && (!cycles.length || cycles.includes(feeClassCycle(c)))).map(c => [c.id, c])).values()];
}
export function feeTargetStudents<T extends FeeTargetStudent>(students: T[], schoolId: string, yearId: string | undefined, classIds: string[]): T[] {
  return [...new Map(students.filter(s => activeFeeStudent(s, schoolId, yearId) && classIds.includes(s.classId || '')).map(s => [s.id, s])).values()];
}
