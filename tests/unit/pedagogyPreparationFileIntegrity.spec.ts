import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { permitsDemoPreparationAnalysis, verifyPreparationBytes } from '../../functions/src/pedagogy/preparationFileIntegrity';
describe('preparation file integrity, not OCR', () => {
  const bytes = Buffer.from('%PDF-1.4 entirely synthetic header fixture');
  const expected = { mimeType: 'application/pdf', size: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex') };
  it('computes the actual bytes hash', () => expect(verifyPreparationBytes(bytes, expected)).toEqual(expected));
  it('does not trust a metadata checksum for different bytes', () => expect(() => verifyPreparationBytes(Buffer.from(bytes.toString().replace('1.4', '1.5')), expected)).toThrow('UPLOAD_CHECKSUM_MISMATCH'));
  it('rejects mismatched sizes', () => expect(() => verifyPreparationBytes(bytes, { ...expected, size: bytes.length + 1 })).toThrow('UPLOAD_SIZE_MISMATCH'));
  it('rejects an incorrect declared MIME type', () => expect(() => verifyPreparationBytes(bytes, { ...expected, mimeType: 'image/jpeg' })).toThrow('UPLOAD_SIGNATURE_MISMATCH'));
  it('requires the whole PNG signature', () => {
    const truncated = Buffer.from([137, 80, 78, 71]);
    expect(() => verifyPreparationBytes(truncated, { size: truncated.length, checksum: createHash('sha256').update(truncated).digest('hex'), mimeType: 'image/png' })).toThrow('UPLOAD_SIGNATURE_MISMATCH');
  });
  it('never enables the demo analyzer in Staging or Production or by emulator flag alone', () => {
    expect(permitsDemoPreparationAnalysis({ emulator: 'true', projectId: 'demo-ecoscolaire' })).toBe(true);
    expect(permitsDemoPreparationAnalysis({ emulator: 'true', projectId: 'ecoscolaire-staging' })).toBe(false);
    expect(permitsDemoPreparationAnalysis({ emulator: 'true', projectId: 'ecoscolaire' })).toBe(false);
    expect(permitsDemoPreparationAnalysis({ emulator: 'true' })).toBe(false);
    expect(permitsDemoPreparationAnalysis({ projectId: 'demo-ecoscolaire' })).toBe(false);
  });
});
