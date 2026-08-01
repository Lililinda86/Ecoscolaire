import { describe, it, expect } from 'vitest';
import { buildTeacherAssignmentCandidates, filterEligibleTeachers } from '../../functions/src/academic/getTeacherAssignmentCandidates';

describe('getTeacherAssignmentCandidates logic', () => {
  it('E.1 filterEligibleTeachers covers all eligibility rules', () => {
    const schoolId = 'S1';

    const staffDocs = [
      { id: '1', schoolId: 'S1', role: 'teacher', isActive: true }, // teacher actif
      { id: '2', schoolId: 'S1', staffType: 'teacher', active: true }, // teacher actif canonique
      { id: '3', schoolId: 'S1', role: 'director', teachingEnabled: true, isActive: true }, // directeur avec teachingEnabled
      { id: '4', schoolId: 'S1', role: 'director', teachingEnabled: false, isActive: true }, // directeur sans teachingEnabled -> exclu
      { id: '5', schoolId: 'S1', role: 'teacher', employmentStatus: 'inactive' }, // inactive -> exclu
      { id: '6', schoolId: 'S1', role: 'teacher', employmentStatus: 'suspended' }, // suspended -> exclu
      { id: '7', schoolId: 'S1', role: 'teacher', employmentStatus: 'departed' }, // departed -> exclu
      { id: '8', schoolId: 'S2', role: 'teacher', isActive: true }, // autre école -> exclu
      { id: '9', role: 'teacher', isActive: true } // sans schoolId -> exclu
    ];

    // @ts-expect-error - missing properties
    const eligible = filterEligibleTeachers(staffDocs, schoolId);

    expect(eligible.length).toBe(3);
    expect(eligible.map(s => s.id)).toEqual(['1', '2', '3']);
  });

  it('E.2 buildTeacherAssignmentCandidates formats and sorts candidates', () => {
    const teachers = [
      { id: 'ST2', schoolId: 'S1', lastName: 'Zeta', firstName: 'Alpha' },
      { id: 'ST1', schoolId: 'S1', lastName: 'Alpha', firstName: 'Beta' }
    ];

    const linksByStaffMap = new Map();
    const byUserSnapshots = new Map();
    const linkDocSnapshots = new Map();

    // @ts-expect-error - missing properties
    const candidates = buildTeacherAssignmentCandidates(teachers, 'S1', linksByStaffMap, byUserSnapshots, linkDocSnapshots);

    expect(candidates.length).toBe(2);
    // Sort deterministe (Alpha before Zeta)
    expect(candidates[0].teacherStaffId).toBe('ST1');
    expect(candidates[0].name).toBe('Alpha Beta');
    expect(candidates[1].teacherStaffId).toBe('ST2');
    expect(candidates[1].name).toBe('Zeta Alpha');
  });
});
