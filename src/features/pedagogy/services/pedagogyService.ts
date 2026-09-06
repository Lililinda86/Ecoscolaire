import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getMetadata, ref, uploadBytes } from 'firebase/storage';
import { db, functions, storage } from '../../../db/firebase';
import type { CurriculumProgram, LessonPreparation, LessonPreparationTemplate, PedagogyWorkspace, PreparationReview, SchoolCurriculumAdoption, TeachingPlan, TeachingPlanItem, TeachingWeek } from '../types';
import type { AssessmentItem, WeeklyAssessment } from '../types';
import type { TeachingState } from '../types';
import { readBoundedDocuments } from './boundedQuery';

const documents = <T>(snapshot: Awaited<ReturnType<typeof getDocs>>): T[] => snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) } as T));

export const loadPedagogyWorkspace = async (schoolId: string, academicYearId: string): Promise<PedagogyWorkspace> => {
  const [programs, adoptions, weeks, plans] = await Promise.all([
    readBoundedDocuments<CurriculumProgram>(query(collection(db, 'curriculumPrograms'), where('status', '==', 'published')), 500, 'Programmes'),
    readBoundedDocuments<SchoolCurriculumAdoption>(query(collection(db, 'schoolCurriculumAdoptions'), where('schoolId', '==', schoolId), where('academicYearId', '==', academicYearId)), 200, 'Adoptions'),
    readBoundedDocuments<TeachingWeek>(query(collection(db, 'teachingWeeks'), where('schoolId', '==', schoolId), where('academicYearId', '==', academicYearId), orderBy('weekStartDate', 'asc')), 100, 'Semaines'),
    readBoundedDocuments<TeachingPlan>(query(collection(db, 'teachingPlans'), where('schoolId', '==', schoolId), where('academicYearId', '==', academicYearId), orderBy('weekStartDate', 'desc')), 2000, 'Plannings')
  ]);
  return {
    programs, adoptions, weeks, plans
  };
};

export const loadTeachingPlanItems = async (schoolId: string, planId: string): Promise<TeachingPlanItem[]> => {
  const items = await readBoundedDocuments<TeachingPlanItem>(query(collection(db, 'teachingPlanItems'), where('schoolId', '==', schoolId), where('planId', '==', planId)), 500, 'Séances');
  return items.sort((a, b) => a.dayIndex - b.dayIndex || a.slotIndex - b.slotIndex);
};

const call = async <TInput extends object, TOutput>(name: string, input: TInput): Promise<TOutput> => {
  const result = await httpsCallable<TInput, TOutput>(functions, name)(input);
  return result.data;
};

export const loadLessonPreparations = async (schoolId: string, academicYearId: string, weekStartDate: string, classId?: string): Promise<LessonPreparation[]> => {
  const clauses = [where('schoolId', '==', schoolId), where('academicYearId', '==', academicYearId), where('weekStartDate', '==', weekStartDate)];
  if (classId) clauses.push(where('classId', '==', classId));
  const preparations = await readBoundedDocuments<LessonPreparation>(query(collection(db, 'lessonPreparations'), ...clauses), 250, 'Préparations : choisissez une classe');
  return preparations.sort((a, b) => (a.classId + a.subjectName + (a.slotIndex || 0)).localeCompare(b.classId + b.subjectName + (b.slotIndex || 0)));
};

export const loadLessonPreparation = async (schoolId: string, preparationId: string): Promise<LessonPreparation> => {
  const snapshot = await getDoc(doc(db, 'lessonPreparations', preparationId));
  if (!snapshot.exists()) throw new Error('Préparation introuvable.');
  const preparation = { id: snapshot.id, ...snapshot.data() } as LessonPreparation;
  if (preparation.schoolId !== schoolId) throw new Error('Accès inter-écoles interdit.');
  return preparation;
};

export const loadPreparationTemplates = async (schoolId: string, academicYearId: string, classId: string): Promise<LessonPreparationTemplate[]> => {
  const snapshot = await getDocs(query(collection(db, 'lessonPreparationTemplates'), where('schoolId', '==', schoolId), where('academicYearId', '==', academicYearId), where('classId', '==', classId), limit(100)));
  return documents<LessonPreparationTemplate>(snapshot);
};

export const ensureExpectedLessonPreparations = (schoolId: string, planId: string) => call<{ schoolId: string; planId: string }, { planId: string; expectedCount: number; createdCount: number }>('ensureExpectedLessonPreparations', { schoolId, planId });
export const startLessonPreparationAnalysis = (schoolId: string, uploadId: string) => call<{ schoolId: string; uploadId: string }, { preparationId: string; analysisStatus: 'succeeded' | 'failed'; fallback?: string }>('startLessonPreparationAnalysis', { schoolId, uploadId });
export const saveLessonPreparationReview = (schoolId: string, preparationId: string, review: PreparationReview) => call('saveLessonPreparationReview', { schoolId, preparationId, review });
export const validateLessonPreparation = (schoolId: string, preparationId: string) => call('validateLessonPreparation', { schoolId, preparationId });
export const recordTeachingConfirmations = (input: { schoolId: string; academicYearId: string; classId: string; weekId: string; requestId: string; declarations: Array<{ preparationId: string; teacherStaffId: string; expectedVersion: number; status: TeachingState; effectiveDate: string; excerpts: string[]; note: string }> }) =>
  call<typeof input, { recordedCount: number; idempotent: boolean }>('recordTeachingConfirmations', input);

export interface ManualPreparationInput {
  academicYearId: string; classId: string; subjectId: string; subjectName: string; teacherStaffId: string;
  weekStartDate: string; lessonTitle: string; objective: string;
}

export const uploadLessonPreparation = async (schoolId: string, file: File, preparationId?: string, manual?: ManualPreparationInput) => {
  const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  const registered = await call<Record<string, unknown>, { preparationId: string; uploadId: string; storagePath: string; created: boolean }>('createLessonPreparationUpload', {
    schoolId, preparationId, ...manual, checksum, fileName: file.name, mimeType: file.type, size: file.size
  });
  const objectRef = ref(storage, registered.storagePath);
  if (registered.created) {
    await uploadBytes(objectRef, file, { contentType: file.type, customMetadata: { checksum, preparationId: registered.preparationId } });
  } else {
    try {
      const metadata = await getMetadata(objectRef);
      if (metadata.customMetadata?.checksum !== checksum || metadata.size !== file.size) throw new Error('Le document enregistré ne correspond pas au fichier. Aucun écrasement effectué.');
    } catch (error) {
      if ((error as { code?: string }).code !== 'storage/object-not-found') throw error;
      // Registration may have succeeded before an interrupted transfer. Only
      // the absent object is retried; immutable existing content is never replaced.
      await uploadBytes(objectRef, file, { contentType: file.type, customMetadata: { checksum, preparationId: registered.preparationId } });
    }
  }
  return registered;
};

export const ensureTeachingWeeks = (schoolId: string, academicYearId: string) => call('ensureTeachingWeeks', { schoolId, academicYearId });
export const adoptCurriculumProgram = (input: { schoolId: string; academicYearId: string; catalogLevelId: string; curriculumProgramId: string }) => call('adoptCurriculumProgram', input);
export const ensureTeachingPlanDraft = (input: { schoolId: string; academicYearId: string; classId: string; weekStartDate: string }) => call<{ schoolId: string; academicYearId: string; classId: string; weekStartDate: string }, { planId: string }>('ensureTeachingPlanDraft', input);
export const generateTeachingPlanProposal = (schoolId: string, planId: string) => call('generateTeachingPlanProposal', { schoolId, planId });
export const saveTeachingPlanAdjustments = (schoolId: string, planId: string, adjustments: Array<Pick<TeachingPlanItem, 'id' | 'lessonTitle' | 'objective' | 'note'>>) => call('saveTeachingPlanAdjustments', { schoolId, planId, adjustments });
export const recordTeacherPlanValidation = (schoolId: string, planId: string, teacherStaffId: string, note: string) => call('recordTeacherPlanValidation', { schoolId, planId, teacherStaffId, note });
export const archiveTeachingPlan = (schoolId: string, planId: string) => call('archiveTeachingPlan', { schoolId, planId });

export interface AssessmentScope { schoolId: string; academicYearId: string; classId: string; weekId: string }
export const loadWeeklyAssessments = async (schoolId: string, academicYearId: string, weekId: string, classId?: string): Promise<WeeklyAssessment[]> => {
  const clauses = [where('schoolId', '==', schoolId), where('academicYearId', '==', academicYearId), where('weekId', '==', weekId)];
  if (classId) clauses.push(where('classId', '==', classId));
  const snapshot = await getDocs(query(collection(db, 'weeklyAssessments'), ...clauses, limit(100)));
  return documents<WeeklyAssessment>(snapshot).sort((a, b) => a.className.localeCompare(b.className));
};
export const loadAssessmentItems = async (schoolId: string, assessmentId: string, generationVersion: number): Promise<AssessmentItem[]> => {
  const snapshot = await getDocs(query(collection(db, 'assessmentItems'), where('schoolId', '==', schoolId), where('weeklyAssessmentId', '==', assessmentId), where('generationVersion', '==', generationVersion), limit(100)));
  return documents<AssessmentItem>(snapshot).sort((a, b) => a.order - b.order);
};
export const ensureWeeklyAssessmentDraft = (scope: AssessmentScope) => call('ensureWeeklyAssessmentDraft', scope);
export const generateWeeklyAssessment = (scope: AssessmentScope, regenerate = false, confirmRevision = false) => call('generateWeeklyAssessment', { ...scope, regenerate, confirmRevision });
export const saveWeeklyAssessmentEdits = (schoolId: string, assessmentId: string, items: Array<Pick<AssessmentItem, 'id' | 'questionText' | 'instructions' | 'points' | 'order'>>, note: string) =>
  call('saveWeeklyAssessmentEdits', { schoolId, assessmentId, items, note });
export const recordWeeklyAssessmentTeacherValidation = (schoolId: string, assessmentId: string, teacherStaffId: string, note: string) =>
  call('recordWeeklyAssessmentTeacherValidation', { schoolId, assessmentId, teacherStaffId, note });
export const markWeeklyAssessmentReadyToPrint = (schoolId: string, assessmentId: string) =>
  call('markWeeklyAssessmentReadyToPrint', { schoolId, assessmentId });
