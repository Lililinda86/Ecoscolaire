import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), counter: 0, fingerprint: vi.fn() }));
vi.mock('../../functions/node_modules/firebase-admin/lib/index.js', () => {
  const ref = (path: string) => ({ path, id: path.split('/').at(-1),
    get: async () => ({ exists: state.docs.has(path), data: () => state.docs.get(path), ref: ref(path), id: path.split('/').at(-1) }),
    collection: (name: string) => collection(path + '/' + name),
  });
  const collection = (path: string) => {
    const filters: Array<[string, string, unknown]> = []; let maximum = 1000;
    const query = {
      doc: (id = 'auto-' + (++state.counter)) => ref(path + '/' + id),
      where: (field: string, operator: string, value: unknown) => { filters.push([field, operator, value]); return query; },
      orderBy: () => query,
      limit: (value: number) => { maximum = value; return query; },
      get: async () => ({ docs: await Promise.all([...state.docs.entries()].filter(([key, value]) => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/') && filters.every(([field, operator, expected]) => operator === '==' ? value[field] === expected : Number(value[field]) <= Number(expected))).slice(0, maximum).map(([key]) => ref(key).get())) }),
    }; return query;
  };
  return { app: () => ({ options: { projectId: 'ecoscolaire-staging' } }), firestore: () => ({ collection,
    runTransaction: async (work: (transaction: unknown) => unknown) => {
      const writes: Array<() => void> = [];
      const result = await work({ get: (document: { get: () => unknown }) => document.get(),
        update: (document: { path: string }, value: object) => writes.push(() => state.docs.set(document.path, { ...state.docs.get(document.path), ...value })),
        set: (document: { path: string }, value: object) => writes.push(() => state.docs.set(document.path, { ...state.docs.get(document.path), ...value })),
        create: (document: { path: string }, value: object) => writes.push(() => { if (state.docs.has(document.path)) throw new Error('EXISTS'); state.docs.set(document.path, { ...value }); }),
      }); writes.forEach(write => write()); return result;
    },
  }) };
});
vi.mock('../../functions/node_modules/firebase-admin/lib/firestore/index.js', () => ({ FieldValue: { serverTimestamp: () => 'unit-server-time' } }));
vi.mock('../../functions/src/pedagogy/sourceWatchFetch', () => ({ fingerprintPublicSource: state.fingerprint }));
import { runPedagogySourceWatch, savePedagogySourceWatch } from '../../functions/src/pedagogy/sourceWatch';
const id = 'watch-school--1', path = 'pedagogySourceWatches/' + id, now = 1000000;
const config = { schoolId: 'watch-school', slot: 1, version: 1, enabled: true, nextCheckAt: now, leaseUntil: 0, intervalMinutes: 360, url: 'https://www.minedub.cm/', fingerprint: null };
describe('watch backend with simulated storage/HTTP, not scheduled-run proof', () => {
  beforeEach(() => { state.docs.clear(); state.counter = 0; state.docs.set('schools/watch-school', { name: 'Synthetic watch' }); state.docs.set(path, { ...config }); state.fingerprint.mockReset().mockResolvedValue({ sha256: 'a'.repeat(64), bytes: 10, mimeType: 'text/plain' }); vi.spyOn(Date, 'now').mockReturnValue(now); });
  afterEach(() => vi.restoreAllMocks());
  it('records a baseline without publishing a curriculum', async () => {
    expect(await runPedagogySourceWatch(now)).toEqual({ checked: 1 });
    expect(state.docs.get(path)).toMatchObject({ status: 'baseline', nextCheckAt: now + 360 * 60000, lease: null, lastSuccessAt: expect.any(Object) });
    const attempts = [...state.docs.entries()].filter(([key]) => key.startsWith('pedagogySourceWatchAttempts/'));
    expect(attempts).toHaveLength(1); expect(attempts[0][1]).toMatchObject({ appliedToCurrentConfiguration: true, publicationDecision: 'none', sourceAuthentication: 'not_established_by_watch' });
    expect([...state.docs.keys()].some(key => key.startsWith('curriculum'))).toBe(false);
  });
  it('keeps a review flag after a later unchanged check', async () => {
    state.docs.set(path, { ...config, fingerprint: { sha256: 'b'.repeat(64) } });
    await runPedagogySourceWatch(now); expect(state.docs.get(path)?.pendingReview).toBe(true);
    state.docs.set(path, { ...state.docs.get(path), nextCheckAt: now });
    await runPedagogySourceWatch(now); expect(state.docs.get(path)).toMatchObject({ status: 'unchanged', pendingReview: true });
  });
  it('retains the last success but reports the current failure', async () => {
    state.docs.set(path, { ...config, lastSuccessAt: 'previous-success' }); state.fingerprint.mockRejectedValue(new Error('SOURCE_TIMEOUT'));
    await runPedagogySourceWatch(now); expect(state.docs.get(path)).toMatchObject({ status: 'failed', lastError: 'SOURCE_TIMEOUT', lastSuccessAt: 'previous-success' });
  });
  it('records corrupt previous fingerprints as failed checks and releases the lease', async () => {
    state.docs.set(path, { ...config, fingerprint: { sha256: 'invalid' } });
    await runPedagogySourceWatch(now);
    expect(state.docs.get(path)).toMatchObject({ status: 'failed', lastError: 'SOURCE_HASH_INVALID', lease: null });
  });
  it('does not apply a stale response to an edited configuration', async () => {
    state.fingerprint.mockImplementation(async () => { state.docs.set(path, { ...config, version: 2, title: 'Edited during fetch', lease: null }); return { sha256: 'a'.repeat(64), bytes: 10 }; });
    await runPedagogySourceWatch(now); expect(state.docs.get(path)).not.toHaveProperty('status');
    expect([...state.docs.values()].find(value => value.sourceWatchId === id)).toMatchObject({ appliedToCurrentConfiguration: false });
  });
  it('does not fetch leased configurations or orphaned schools', async () => {
    state.docs.set(path, { ...config, leaseUntil: now + 1 }); expect(await runPedagogySourceWatch(now)).toEqual({ checked: 0 });
    state.docs.set(path, { ...config }); state.docs.delete('schools/watch-school'); expect(await runPedagogySourceWatch(now)).toEqual({ checked: 0 });
    expect(state.fingerprint).not.toHaveBeenCalled(); expect(state.docs.get(path)?.enabled).toBe(false);
  });
  it('denies secretary configuration changes before writes', async () => {
    state.docs.set('users/unit-secretary', { role: 'secretary', schoolId: 'watch-school', isActive: true });
    await expect(savePedagogySourceWatch.run({ schoolId: 'watch-school' }, { auth: { uid: 'unit-secretary', token: {} } } as never)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.docs.get(path)).toEqual(config);
  });
});
