import { useCallback, useEffect, useState } from 'react';
import { loadLessonPreparations } from '../services/pedagogyService';
import type { LessonPreparation } from '../types';

export const useLessonPreparations = (schoolId?: string, academicYearId?: string, weekStartDate?: string, classId?: string) => {
  const [preparations, setPreparations] = useState<LessonPreparation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!schoolId || !academicYearId || !weekStartDate) { setPreparations([]); return; }
    setLoading(true); setError('');
    try { setPreparations(await loadLessonPreparations(schoolId, academicYearId, weekStartDate, classId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Préparations indisponibles.'); }
    finally { setLoading(false); }
  }, [schoolId, academicYearId, weekStartDate, classId]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { preparations, loading, error, refresh };
};
