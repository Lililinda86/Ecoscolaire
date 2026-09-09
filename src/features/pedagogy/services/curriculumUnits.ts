import { collection, query, where } from 'firebase/firestore';
import { db } from '../../../db/firebase';
import { readBoundedDocuments } from './boundedQuery';
import { pedagogyAdoptionId } from '../ids';

export interface CurriculumReviewDecision { id: string; schoolId: string; reviewOutcome: 'request_correction' | 'not_applicable'; declaredBy: string; effectiveDate: string; reference: string; programVersion: string }
export async function loadCurriculumReviewDecisions(schoolId: string, yearId: string, levelId: string) {
  return readBoundedDocuments<CurriculumReviewDecision>(query(collection(db, 'schoolCurriculumAdoptions', pedagogyAdoptionId(schoolId, yearId, levelId), 'reviewDecisions'), where('schoolId', '==', schoolId)), 200, 'Décisions de revue');
}

export interface CurriculumUnitDetail {
  id: string; programId: string; catalogLevelId: string; subjectId: string;
  title: string; objective: string; sequence: number; status: string;
  subjectName?: string; domain?: string; theme?: string; competency?: string;
  sourceUrl?: string; sourceLocator?: string; indicativeHours?: number;
  verificationStatus?: string;
  officialLesson?: string | null;
}

export async function loadPublishedCurriculumUnits(programId: string, levelId: string): Promise<CurriculumUnitDetail[]> {
  if (!programId || !levelId) return [];
  const units = await readBoundedDocuments<CurriculumUnitDetail>(query(collection(db, 'curriculumUnits'), where('programId', '==', programId), where('catalogLevelId', '==', levelId)), 500, 'Unités du niveau');
  return units.filter(unit => unit.programId === programId && unit.catalogLevelId === levelId && unit.status === 'published').sort((a, b) => (a.sequence || 0) - (b.sequence || 0) || a.id.localeCompare(b.id));
}
