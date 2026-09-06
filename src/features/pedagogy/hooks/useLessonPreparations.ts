import { useCallback } from 'react';
import { useScopedResource } from './useScopedResource';
import { loadLessonPreparations } from '../services/pedagogyService';
import type { LessonPreparation } from '../types';
const empty: LessonPreparation[] = [];

export const useLessonPreparations = (schoolId?: string, academicYearId?: string, weekStartDate?: string, classId?: string) => {
  const scope = schoolId && academicYearId && weekStartDate ? JSON.stringify([schoolId, academicYearId, weekStartDate, classId || null]) : null;
  const load = useCallback(() => loadLessonPreparations(schoolId!, academicYearId!, weekStartDate!, classId), [schoolId, academicYearId, weekStartDate, classId]);
  const resource = useScopedResource(scope, empty, load, 'Préparations indisponibles.');
  return { preparations: resource.data, loading: resource.loading, error: resource.error, refresh: resource.refresh };
};
