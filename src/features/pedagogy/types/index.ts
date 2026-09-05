export type TeachingPlanStatus = 'draft' | 'proposed' | 'needs_adjustment' | 'adjusted' | 'teacher_validated' | 'archived';
export type TeachingPlanItemStatus = 'planned' | 'adjusted' | 'teacher_validated' | 'cancelled';

export interface CurriculumProgram {
  id: string;
  title: string;
  countryCode: string;
  section: string;
  cycle: string;
  version: string;
  status: 'draft' | 'published' | 'archived';
  sourceType: 'official' | 'mock';
  checksum?: string;
  provenance?: { label?: string; note?: string; sourceUrl?: string };
}

export interface SchoolCurriculumAdoption {
  id: string;
  schoolId: string;
  academicYearId: string;
  catalogLevelId: string;
  curriculumProgramId: string;
  status: 'active' | 'archived';
}

export interface TeachingWeek {
  id: string;
  schoolId: string;
  academicYearId: string;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  status: 'open' | 'closed';
}

export interface TeachingPlan {
  id: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  weekId: string;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  status: TeachingPlanStatus;
  itemCount?: number;
  generatorVersion?: string;
  teacherStaffId?: string;
  teacherValidated?: boolean;
  teacherValidatedAt?: unknown;
  teacherValidationRecordedBy?: string;
  teacherValidationRecordedAt?: unknown;
  teacherValidationNote?: string;
  version: number;
}

export interface TeachingPlanItem {
  id: string;
  schoolId: string;
  planId: string;
  classId: string;
  subjectId: string;
  subjectName: string;
  teacherStaffId: string;
  curriculumUnitId: string;
  lessonTitle: string;
  objective: string;
  note?: string;
  dayIndex: number;
  slotIndex: number;
  status: TeachingPlanItemStatus;
}

export interface PedagogyWorkspace {
  programs: CurriculumProgram[];
  adoptions: SchoolCurriculumAdoption[];
  weeks: TeachingWeek[];
  plans: TeachingPlan[];
}
