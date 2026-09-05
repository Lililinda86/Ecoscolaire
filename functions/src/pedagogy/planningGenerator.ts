import { teachingPlanItemId } from './ids';

export interface GeneratorSubject { subjectId: string; subjectName: string; teacherStaffId: string; weeklyHours: number }
export interface GeneratorUnit { id: string; subjectId: string; title: string; objective?: string; sequence: number }
export interface GeneratedPlanItem {
  id: string;
  subjectId: string;
  subjectName: string;
  teacherStaffId: string;
  curriculumUnitId: string;
  lessonTitle: string;
  objective: string;
  dayIndex: number;
  slotIndex: number;
  status: 'proposed';
}
export interface PlanningGenerator {
  version: string;
  generate(input: { planId: string; weekNumber: number; subjects: GeneratorSubject[]; units: GeneratorUnit[] }): GeneratedPlanItem[];
}

export const deterministicPlanningGenerator: PlanningGenerator = {
  version: 'deterministic-v1',
  generate: ({ planId, weekNumber, subjects, units }) => {
    const output: GeneratedPlanItem[] = [];
    let cursor = 0;
    [...subjects].sort((a, b) => a.subjectId.localeCompare(b.subjectId)).forEach(subject => {
      const available = units.filter(unit => unit.subjectId === subject.subjectId).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
      const count = Math.max(1, Math.min(5, Math.round(subject.weeklyHours || 1)));
      for (let index = 0; index < count && available.length; index += 1) {
        const unit = available[(weekNumber - 1 + index) % available.length];
        const dayIndex = (cursor % 5) + 1;
        const slotIndex = Math.floor(cursor / 5) + 1;
        output.push({
          id: teachingPlanItemId(planId, subject.subjectId, dayIndex, slotIndex),
          subjectId: subject.subjectId, subjectName: subject.subjectName,
          teacherStaffId: subject.teacherStaffId, curriculumUnitId: unit.id,
          lessonTitle: unit.title, objective: unit.objective || '', dayIndex, slotIndex, status: 'proposed'
        });
        cursor += 1;
      }
    });
    return output;
  }
};
