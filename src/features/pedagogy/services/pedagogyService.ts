import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../db/firebase';
import type { CurriculumProgram, PedagogyWorkspace, SchoolCurriculumAdoption, TeachingPlan, TeachingPlanItem, TeachingWeek } from '../types';

const documents = <T>(snapshot: Awaited<ReturnType<typeof getDocs>>): T[] => snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) } as T));

export const loadPedagogyWorkspace = async (schoolId: string, academicYearId: string): Promise<PedagogyWorkspace> => {
  const [programs, adoptions, weeks, plans] = await Promise.all([
    getDocs(query(collection(db, 'curriculumPrograms'), where('status', '==', 'published'))),
    getDocs(query(collection(db, 'schoolCurriculumAdoptions'), where('schoolId', '==', schoolId), where('academicYearId', '==', academicYearId))),
    getDocs(query(collection(db, 'teachingWeeks'), where('schoolId', '==', schoolId), where('academicYearId', '==', academicYearId), orderBy('weekStartDate', 'asc'))),
    getDocs(query(collection(db, 'teachingPlans'), where('schoolId', '==', schoolId), where('academicYearId', '==', academicYearId), orderBy('weekStartDate', 'desc')))
  ]);
  return {
    programs: documents<CurriculumProgram>(programs),
    adoptions: documents<SchoolCurriculumAdoption>(adoptions),
    weeks: documents<TeachingWeek>(weeks),
    plans: documents<TeachingPlan>(plans)
  };
};

export const loadTeachingPlanItems = async (schoolId: string, planId: string): Promise<TeachingPlanItem[]> => {
  const snapshot = await getDocs(query(collection(db, 'teachingPlanItems'), where('schoolId', '==', schoolId), where('planId', '==', planId)));
  return documents<TeachingPlanItem>(snapshot).sort((a, b) => a.dayIndex - b.dayIndex || a.slotIndex - b.slotIndex);
};

const call = async <TInput extends object, TOutput>(name: string, input: TInput): Promise<TOutput> => {
  const result = await httpsCallable<TInput, TOutput>(functions, name)(input);
  return result.data;
};

export const ensureTeachingWeeks = (schoolId: string, academicYearId: string) => call('ensureTeachingWeeks', { schoolId, academicYearId });
export const adoptCurriculumProgram = (input: { schoolId: string; academicYearId: string; catalogLevelId: string; curriculumProgramId: string }) => call('adoptCurriculumProgram', input);
export const ensureTeachingPlanDraft = (input: { schoolId: string; academicYearId: string; classId: string; weekStartDate: string }) => call<{ schoolId: string; academicYearId: string; classId: string; weekStartDate: string }, { planId: string }>('ensureTeachingPlanDraft', input);
export const generateTeachingPlanProposal = (schoolId: string, planId: string) => call('generateTeachingPlanProposal', { schoolId, planId });
export const saveTeachingPlanAdjustments = (schoolId: string, planId: string, adjustments: Array<Pick<TeachingPlanItem, 'id' | 'lessonTitle' | 'objective' | 'note'>>) => call('saveTeachingPlanAdjustments', { schoolId, planId, adjustments });
export const recordTeacherValidation = (schoolId: string, planId: string, teacherStaffId: string, note: string) => call('recordTeacherValidation', { schoolId, planId, teacherStaffId, note });
export const archiveTeachingPlan = (schoolId: string, planId: string) => call('archiveTeachingPlan', { schoolId, planId });
