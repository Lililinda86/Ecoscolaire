import { useCallback } from 'react';
import { useScopedResource } from './useScopedResource';
import { loadPedagogyWorkspace } from '../services/pedagogyService';
import type { PedagogyWorkspace } from '../types';

const empty: PedagogyWorkspace = { programs: [], adoptions: [], weeks: [], plans: [] };

export const usePedagogyWorkspace = (schoolId?: string, academicYearId?: string) => {
  const scope = schoolId && academicYearId ? JSON.stringify([schoolId, academicYearId]) : null;
  const load = useCallback(() => loadPedagogyWorkspace(schoolId!, academicYearId!), [schoolId, academicYearId]);
  const resource = useScopedResource(scope, empty, load, 'Chargement impossible.');
  return { ...resource.data, loading: resource.loading, error: resource.error, refresh: resource.refresh };
};
