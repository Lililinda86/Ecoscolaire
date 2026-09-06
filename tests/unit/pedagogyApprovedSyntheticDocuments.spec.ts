import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertApprovedSyntheticDocument } from '../../functions/src/pedagogy/approvedSyntheticDocuments';
import { buildPedagogyAiRequest, type PedagogyAiConfiguration } from '../../functions/src/pedagogy/aiProtocol';
const samples = [
  ['pre-fr.pdf', 'application/pdf'], ['nursery-en.pdf', 'application/pdf'],
  ['primary-fr.pdf', 'application/pdf'], ['primary-en.png', 'image/png'], ['college-en.png', 'image/png'],
] as const;
const config: PedagogyAiConfiguration = { enabled: true, provider: 'openai', model: 'gpt-4.1-mini-2025-04-14', version: 1, maxOutputTokens: 2000, maxInputBytes: 10000, dailyCallLimit: 10, dailyBudgetMicros: 2000000, inputPriceMicrosPerMillionTokens: 400000, outputPriceMicrosPerMillionTokens: 1600000, approvalReference: 'synthetic-unit-only', privacyReviewReference: 'synthetic-unit-only' };
describe('exact approved synthetic document bytes; no provider verification', () => {
  it.each(samples)('accepts only inspected fixture %s with the exact MIME type', (name, mimeType) => {
    const bytes = readFileSync(new URL('../fixtures/synthetic-pedagogy-ai/' + name, import.meta.url));
    expect(assertApprovedSyntheticDocument(bytes, mimeType)).toMatch(/^[a-f0-9]{64}$/);
    const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1;
    expect(() => assertApprovedSyntheticDocument(changed, mimeType)).toThrow('AI_DOCUMENT_NOT_IN_APPROVED_SYNTHETIC_SET');
    const built = buildPedagogyAiRequest(config, { purpose: 'preparation_analysis', instructions: 'Synthetic extraction', content: 'Synthetic input', schema: {}, sourceKey: name, document: { mimeType, bytesBase64: bytes.toString('base64') } });
    expect(built.requiresTokenCount).toBe(true);
    expect(built.reservedInputTokens).toBeGreaterThan(200000);
    expect(built.body.input[0].content[1].type).toBe(mimeType === 'application/pdf' ? 'input_file' : 'input_image');
    expect(built.body.store).toBe(false);
  });
  it('rejects arbitrary documents regardless of a synthetic-looking identifier', () => {
    expect(() => assertApprovedSyntheticDocument(Buffer.from('synthetic-looking but not reviewed'), 'application/pdf')).toThrow('AI_DOCUMENT_NOT_IN_APPROVED_SYNTHETIC_SET');
  });
  it('rejects MIME substitution and document use outside preparation analysis', () => {
    const bytes = readFileSync(new URL('../fixtures/synthetic-pedagogy-ai/pre-fr.pdf', import.meta.url));
    expect(() => assertApprovedSyntheticDocument(bytes, 'image/png')).toThrow('AI_DOCUMENT_NOT_IN_APPROVED_SYNTHETIC_SET');
    expect(() => buildPedagogyAiRequest(config, { purpose: 'weekly_assessment', instructions: '', content: '', schema: {}, sourceKey: 'synthetic', document: { mimeType: 'application/pdf', bytesBase64: bytes.toString('base64') } })).toThrow('AI_DOCUMENT_PURPOSE_INVALID');
  });
});
