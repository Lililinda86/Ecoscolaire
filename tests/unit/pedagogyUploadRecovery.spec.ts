import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
const mocks = vi.hoisted(() => ({ call: vi.fn(), getMetadata: vi.fn(), uploadBytes: vi.fn(), ref: vi.fn(() => 'synthetic-object') }));
vi.mock('../../src/db/firebase', () => ({ db: {}, functions: {}, storage: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => mocks.call }));
vi.mock('firebase/storage', () => mocks);
import { uploadLessonPreparation } from '../../src/features/pedagogy/services/pedagogyService';
const file = { name: 'synthetic.txt', type: 'application/pdf', size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as File;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  mocks.call.mockResolvedValue({ data: { preparationId: 'synthetic-preparation', uploadId: 'synthetic-upload', storagePath: 'synthetic/path', created: false } });
  mocks.uploadBytes.mockResolvedValue({});
});
describe('registered upload recovery', () => {
  it('retries an absent object using the same registration', async () => {
    mocks.getMetadata.mockRejectedValueOnce({ code: 'storage/object-not-found' });
    const result = await uploadLessonPreparation('synthetic-school', file, 'synthetic-preparation');
    expect(result.uploadId).toBe('synthetic-upload');
    expect(mocks.call).toHaveBeenCalledTimes(1);
    expect(mocks.uploadBytes).toHaveBeenCalledTimes(1);
  });
  it('never overwrites an existing different document', async () => {
    mocks.getMetadata.mockResolvedValueOnce({ size: 3, customMetadata: { checksum: 'different' } });
    await expect(uploadLessonPreparation('synthetic-school', file, 'synthetic-preparation')).rejects.toThrow('Aucun écrasement');
    expect(mocks.uploadBytes).not.toHaveBeenCalled();
  });
  it('does not treat authorization or network failure as object absence', async () => {
    mocks.getMetadata.mockRejectedValueOnce({ code: 'storage/unauthorized' });
    await expect(uploadLessonPreparation('synthetic-school', file, 'synthetic-preparation')).rejects.toMatchObject({ code: 'storage/unauthorized' });
    expect(mocks.uploadBytes).not.toHaveBeenCalled();
  });
});
