import { collection, query, where } from 'firebase/firestore';
import { db } from '../../../db/firebase';
import { readBoundedDocuments } from './boundedQuery';
import type { WeeklyAssessment } from '../types';

export function internalExamBankEntries(items: WeeklyAssessment[], schoolId: string, yearId: string, classId: string) {
  return items.filter(item => item.schoolId === schoolId && item.academicYearId === yearId && item.classId === classId &&
    item.generationStatus === 'succeeded' && item.teacherValidated === true &&
    ['teacher_validated', 'ready_to_print'].includes(item.status))
    .sort((a, b) => b.fridayDate.localeCompare(a.fridayDate) || b.generationVersion - a.generationVersion);
}
export async function loadInternalExamBank(schoolId: string, yearId: string, classId: string) {
  if (!schoolId || !yearId || !classId) return [];
  const items = await readBoundedDocuments<WeeklyAssessment>(query(collection(db, 'weeklyAssessments'),
    where('schoolId', '==', schoolId), where('academicYearId', '==', yearId), where('classId', '==', classId)), 500, 'Banque interne');
  return internalExamBankEntries(items, schoolId, yearId, classId);
}
