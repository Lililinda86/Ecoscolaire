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

export type LessonPreparationStatus = 'expected' | 'uploaded' | 'needs_review' | 'validated';
export type PreparationAnalysisStatus = 'not_started' | 'pending' | 'processing' | 'succeeded' | 'failed';

export interface LessonPreparationTemplate {
  id: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  subjectName: string;
  version: number;
  schemaVersion: 'lesson-preparation-template-v1';
  status: 'active' | 'archived';
  sections: Array<{ key: string; title: string; fields: string[] }>;
}

export interface PreparationReview {
  lessonTitle: string;
  objective: string;
  prerequisites: string;
  materials: string;
  lessonSteps: string;
  assessment: string;
  differentiation: string;
}

export interface LessonPreparation {
  id: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  weekId?: string;
  weekNumber?: number;
  weekStartDate: string;
  weekEndDate?: string;
  planId?: string;
  teachingPlanItemId?: string;
  source: 'planned' | 'manual_unplanned';
  templateId?: string;
  subjectId: string;
  subjectName: string;
  teacherStaffId: string;
  curriculumUnitId?: string | null;
  lessonDate?: string | null;
  dayIndex?: number;
  slotIndex?: number;
  lessonTitle?: string | null;
  objective?: string | null;
  status: LessonPreparationStatus;
  analysisStatus: PreparationAnalysisStatus;
  currentUploadId?: string;
  currentAnalysisId?: string;
  analysisError?: string;
  extractedData?: Record<string, unknown>;
  reviewData?: PreparationReview;
  validationMeaning?: string;
  version: number;
}

export type WeeklyAssessmentStatus = 'draft' | 'generating' | 'needs_review' | 'teacher_validated' | 'ready_to_print' | 'failed' | 'archived';
export type AssessmentQuestionType = 'short_answer' | 'multiple_choice' | 'true_false' | 'fill_blank' | 'exercise';

export interface AssessmentSubjectSummary { id: string; name: string }

export interface WeeklyAssessment {
  id: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  className: string;
  weekId: string;
  weekStartDate: string;
  weekEndDate: string;
  fridayDate: string;
  status: WeeklyAssessmentStatus;
  generationStatus: 'pending' | 'processing' | 'succeeded' | 'failed';
  generationVersion: number;
  title?: string;
  instructions?: string;
  durationMinutes: number;
  totalPoints: number;
  coveredSubjects: AssessmentSubjectSummary[];
  missingSubjects: AssessmentSubjectSummary[];
  validatedPreparationCount: number;
  expectedPreparationCount: number;
  coveragePercent: number;
  partial: boolean;
  sourcePreparationIds?: string[];
  sourcePreparationVersions?: Record<string, number>;
  sourceChecksum?: string;
  sourceSnapshot?: Array<Record<string, unknown>>;
  teacherValidated?: boolean;
  teacherStaffId?: string;
  teacherValidationMeaning?: string;
  teacherValidationNote?: string;
  generationError?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AssessmentItem {
  id: string;
  weeklyAssessmentId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  weekId: string;
  subjectId: string;
  classSubjectId: string;
  sourceLessonPreparationIds: string[];
  sourceCurriculumUnitIds: string[];
  questionType: AssessmentQuestionType;
  questionText: string;
  instructions: string;
  points: number;
  expectedAnswer: string;
  correctionGuide: string;
  difficulty: 'easy' | 'medium' | 'hard';
  order: number;
  generationVersion: number;
  lastEditedBy?: string;
  lastEditedAt?: unknown;
  editReason?: string;
}

export interface PedagogyWorkspace {
  programs: CurriculumProgram[];
  adoptions: SchoolCurriculumAdoption[];
  weeks: TeachingWeek[];
  plans: TeachingPlan[];
}
