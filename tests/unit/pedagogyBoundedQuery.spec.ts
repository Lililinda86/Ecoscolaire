import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Query } from 'firebase/firestore';
import { readBoundedDocuments } from '../../src/features/pedagogy/services/boundedQuery';

const mocks = vi.hoisted(() => ({ getDocs: vi.fn(), startAfter: vi.fn((cursor: unknown) => ({ cursor })), limit: vi.fn((count: number) => ({ count })) }));
vi.mock('firebase/firestore', () => ({ ...mocks, query: (...args: unknown[]) => args }));
const base = {} as Query;
const page = (count: number, offset = 0) => ({ size: count, docs: Array.from({ length: count }, (_, i) => ({ id: `synthetic-${offset + i}`, data: () => ({ id: 'untrusted-data-id', value: offset + i }) })) });
beforeEach(() => vi.clearAllMocks());
describe('bounded pedagogy pagination', () => {
  it('reads pages without silently truncating and preserves document identity', async () => {
    mocks.getDocs.mockResolvedValueOnce(page(100)).mockResolvedValueOnce(page(100, 100)).mockResolvedValueOnce(page(5, 200));
    const result = await readBoundedDocuments<{ id: string }>(base, 250, 'Fixtures');
    expect(result).toHaveLength(205);
    expect(result[0].id).toBe('synthetic-0');
    expect(mocks.startAfter).toHaveBeenCalledTimes(2);
    expect(mocks.limit.mock.calls.map(args => args[0])).toEqual([100, 100, 51]);
  });
  it('rejects overflow instead of returning a partial list', async () => {
    mocks.getDocs.mockResolvedValueOnce(page(100)).mockResolvedValueOnce(page(1, 100));
    await expect(readBoundedDocuments(base, 100, 'Fixtures')).rejects.toThrow('aucun résultat tronqué');
  });
  it('allows the exact bound only after checking for another document', async () => {
    mocks.getDocs.mockResolvedValueOnce(page(100)).mockResolvedValueOnce(page(0));
    expect(await readBoundedDocuments(base, 100, 'Fixtures')).toHaveLength(100);
    expect(mocks.limit.mock.calls.map(args => args[0])).toEqual([100, 1]);
  });
  it('rejects invalid bounds before reading', async () => {
    await expect(readBoundedDocuments(base, 0, 'Fixtures')).rejects.toThrow('Invalid query bound');
    expect(mocks.getDocs).not.toHaveBeenCalled();
  });
});
