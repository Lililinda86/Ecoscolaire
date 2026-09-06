import { createHash } from 'node:crypto';
export function verifyPreparationBytes(bytes: Buffer, expected: { size: number; checksum: string; mimeType: string }) {
  if (!Number.isInteger(expected.size) || expected.size < 1 || expected.size > 10 * 1024 * 1024 || bytes.length !== expected.size) throw new Error('UPLOAD_SIZE_MISMATCH');
  if (createHash('sha256').update(bytes).digest('hex') !== expected.checksum) throw new Error('UPLOAD_CHECKSUM_MISMATCH');
  const signature = expected.mimeType === 'application/pdf' ? bytes.subarray(0, 5).toString('ascii') === '%PDF-'
    : expected.mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : expected.mimeType === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) : false;
  if (!signature) throw new Error('UPLOAD_SIGNATURE_MISMATCH');
  // Header integrity is not full PDF/image parsing or OCR and is not presented as such.
  return { checksum: expected.checksum, size: bytes.length, mimeType: expected.mimeType };
}
export function permitsDemoPreparationAnalysis(environment: { emulator?: string; projectId?: string }) {
  return environment.emulator === 'true' && Boolean(environment.projectId?.startsWith('demo-'));
}
