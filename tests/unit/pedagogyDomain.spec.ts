import { describe, expect, it } from 'vitest';
import { adoptionId, mondayIso, teachingPlanId, teachingPlanItemId, teachingWeekId } from '../../functions/src/pedagogy/ids';
import { deterministicPlanningGenerator } from '../../functions/src/pedagogy/planningGenerator';
import { canArchiveTeachingPlan, canEditTeachingPlan, canValidateTeachingPlan } from '../../src/features/pedagogy/validators';

describe('pedagogy deterministic identifiers', () => {
  it('normalizes every date to its UTC Monday', () => {
    expect(mondayIso('2026-09-09')).toBe('2026-09-07');
    expect(teachingWeekId('school-a', 'year-1', '2026-09-09')).toBe('school-a__year-1__2026-09-07');
    expect(teachingPlanId('school-a', 'year-1', 'class-1', '2026-09-11')).toBe('school-a__year-1__class-1__2026-09-07');
    expect(adoptionId('school-a', 'year-1', 'primary-1')).toBe('school-a__year-1__primary-1');
  });

  it('rejects invalid slot coordinates', () => {
    expect(() => teachingPlanItemId('plan', 'math', 0, 1)).toThrow('INVALID_SLOT');
  });
});

describe('deterministic planning generator', () => {
  const input = {
    planId: 'plan-1', weekNumber: 2,
    subjects: [{ subjectId: 'math', subjectName: 'Mathématiques', teacherStaffId: 'teacher-1', weeklyHours: 2 }],
    units: [
      { id: 'u1', subjectId: 'math', title: 'Numération', sequence: 1 },
      { id: 'u2', subjectId: 'math', title: 'Calcul', objective: 'Additionner', sequence: 2 }
    ]
  };
  it('is reproducible and carries curriculum and teacher references', () => {
    const first = deterministicPlanningGenerator.generate(input);
    expect(deterministicPlanningGenerator.generate(input)).toEqual(first);
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({ curriculumUnitId: 'u2', teacherStaffId: 'teacher-1', lessonTitle: 'Calcul', dayIndex: 1, status: 'proposed' });
  });
});

describe('teaching plan transition guards', () => {
  it('keeps validation and archive transitions explicit', () => {
    expect(canEditTeachingPlan('adjusted')).toBe(true);
    expect(canEditTeachingPlan('teacher_validated')).toBe(false);
    expect(canValidateTeachingPlan('proposed')).toBe(true);
    expect(canArchiveTeachingPlan('teacher_validated')).toBe(true);
    expect(canArchiveTeachingPlan('proposed')).toBe(false);
  });
});
