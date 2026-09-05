import { useCallback, useEffect, useState } from 'react';
import { loadPedagogyWorkspace } from '../services/pedagogyService';
import type { PedagogyWorkspace } from '../types';

const empty: PedagogyWorkspace = { programs: [], adoptions: [], weeks: [], plans: [] };

export const usePedagogyWorkspace = (schoolId?: string, academicYearId?: string) => {
  const [data, setData] = useState<PedagogyWorkspace>(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!schoolId || !academicYearId) { setData(empty); return; }
    setLoading(true); setError('');
    try { setData(await loadPedagogyWorkspace(schoolId, academicYearId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Chargement impossible.'); }
    finally { setLoading(false); }
  }, [schoolId, academicYearId]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { ...data, loading, error, refresh };
};
