import { collection, query, where } from 'firebase/firestore';
import { db } from '../../../db/firebase';
import { readBoundedDocuments } from './boundedQuery';

export interface CurriculumUnitDetail {
  id: string; programId: string; catalogLevelId: string; subjectId: string;
  title: string; objective: string; sequence: number; status: string;
  subjectName?: string; domain?: string; theme?: string; competency?: string;
  sourceUrl?: string; sourceLocator?: string; indicativeHours?: number;
}

export async function loadPublishedCurriculumUnits(programId: string, levelId: string): Promise<CurriculumUnitDetail[]> {
  if (!programId || !levelId) return [];
  const units = await readBoundedDocuments<CurriculumUnitDetail>(query(collection(db, 'curriculumUnits'), where('programId', '==', programId), where('catalogLevelId', '==', levelId)), 500, 'Unités du niveau');
  return units.filter(unit => unit.programId === programId && unit.catalogLevelId === levelId && unit.status === 'published').sort((a, b) => (a.sequence || 0) - (b.sequence || 0) || a.id.localeCompare(b.id));
}
