import { useCallback, useEffect, useRef, useState } from 'react';

/** Never expose a previous tenant/scope while a new request is loading. */
export function useScopedResource<T>(scope: string | null, empty: T, load: () => Promise<T>, fallback: string) {
  const sequence = useRef(0);
  const activeScope = useRef<string | null>(null);
  const [state, setState] = useState({ scope, data: empty, loading: Boolean(scope), error: '' });
  const fetchResource = useCallback(async () => {
    if (!scope || activeScope.current !== scope) return;
    const request = ++sequence.current;
    await Promise.resolve().then(load).then(data => {
      if (request === sequence.current && activeScope.current === scope) {
        setState({ scope, data, loading: false, error: '' });
      }
    }).catch(cause => {
      if (request === sequence.current && activeScope.current === scope) {
        setState({ scope, data: empty, loading: false, error: cause instanceof Error ? cause.message : fallback });
      }
    });
  }, [scope, empty, load, fallback]);
  const refresh = useCallback(async () => {
    if (!scope || activeScope.current !== scope) return;
    setState({ scope, data: empty, loading: true, error: '' });
    await fetchResource();
  }, [scope, empty, fetchResource]);
  useEffect(() => {
    activeScope.current = scope;
    void fetchResource();
    return () => { activeScope.current = null; sequence.current += 1; };
  }, [scope, fetchResource]);
  const visible = scope && state.scope === scope ? state : { data: empty, loading: Boolean(scope), error: '' };
  return { ...visible, refresh };
}
