import { localEducationStage } from '../../../../functions/src/pedagogy/pedagogyPolicy';
type Classroom = Parameters<typeof localEducationStage>[0] & { id: string; schoolId?: string; isActive?: boolean };
type Assessment = { schoolId: string; academicYearId: string; weekId: string; classId: string; status: string };
/** Counts configured primary/secondary classes, never inferred taught coverage. */
export function dashboardAssessmentCoverage(classes: Classroom[], assessments: Assessment[], schoolId: string, academicYearId: string, weekId: string) {
  const eligible = classes.filter(item => item.schoolId === schoolId && item.isActive !== false && ['primary', 'secondary'].includes(localEducationStage(item)));
  const classIds = new Set(eligible.map(item => item.id));
  const covered = new Set(assessments.filter(item => item.schoolId === schoolId && item.academicYearId === academicYearId && item.weekId === weekId && item.status !== 'archived' && classIds.has(item.classId)).map(item => item.classId));
  return { configuredNumericClasses: classIds.size, classesWithAssessment: covered.size, classesWithoutAssessment: classIds.size - covered.size };
}
