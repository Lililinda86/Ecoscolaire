/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScopedResource } from '../../src/features/pedagogy/hooks/useScopedResource';

const empty: string[] = [];
function deferred() {
  let resolve!: (value: string[]) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<string[]>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(cleanup);
describe('pedagogy scoped resources', () => {
  it('hides the previous scope and rejects late responses and stale refresh callbacks', async () => {
    const a = deferred(), b = deferred();
    const loadA = vi.fn(() => a.promise), loadB = vi.fn(() => b.promise);
    const { result, rerender } = renderHook(({ scope, load }) => useScopedResource(scope, empty, load, 'Unavailable'), {
      initialProps: { scope: 'synthetic-school-a/year/class', load: loadA }
    });
    const staleRefresh = result.current.refresh;
    rerender({ scope: 'synthetic-school-b/year/class', load: loadB });
    expect(result.current.data).toEqual([]);
    await act(async () => { b.resolve(['B']); });
    await waitFor(() => expect(result.current.data).toEqual(['B']));
    await act(async () => { a.resolve(['A']); await staleRefresh(); });
    expect(result.current.data).toEqual(['B']);
    expect(loadA).toHaveBeenCalledTimes(1);
  });
  it('only accepts the latest same-scope refresh and hides old data on failure', async () => {
    const first = deferred(), second = deferred(), failed = deferred();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(failed.promise);
    const { result } = renderHook(() => useScopedResource('synthetic', empty, load, 'Unavailable'));
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.refresh(); });
    await act(async () => { second.resolve(['new']); await refresh; });
    await act(async () => { first.resolve(['old']); });
    expect(result.current.data).toEqual(['new']);
    act(() => { refresh = result.current.refresh(); });
    expect(result.current.data).toEqual([]);
    await act(async () => { failed.reject(new Error('Synthetic failure')); await refresh; });
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBe('Synthetic failure');
  });
  it('clears all visible state when scope disappears and ignores pending work after unmount', async () => {
    const pending = deferred(), load = vi.fn(() => pending.promise);
    const { result, rerender, unmount } = renderHook(({ scope }: { scope: string | null }) => useScopedResource(scope, empty, load, 'Unavailable'), { initialProps: { scope: 'synthetic' as string | null } });
    rerender({ scope: null });
    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(false);
    unmount();
    await act(async () => { pending.resolve(['late']); });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
