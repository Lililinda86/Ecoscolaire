import { describe, expect, it } from 'vitest';
import { buildPedagogyAiRequest, parsePedagogyAiResponse, validateAiConfiguration, type PedagogyAiConfiguration } from '../../functions/src/pedagogy/aiProtocol';
const config: PedagogyAiConfiguration = { enabled: true, provider: 'openai', model: 'synthetic-test-model', version: 1, maxOutputTokens: 1000, maxInputBytes: 10000, dailyCallLimit: 10, dailyBudgetMicros: 100000, inputPriceMicrosPerMillionTokens: 1000000, outputPriceMicrosPerMillionTokens: 1000000, approvalReference: 'synthetic-budget', privacyReviewReference: 'synthetic-privacy' };
const request = { purpose: 'weekly_assessment' as const, instructions: 'Only taught content.', content: '{"source":"A circle is round"}', schema: { type: 'object', properties: {}, additionalProperties: false, required: [] }, sourceKey: 'synthetic-source' };
describe('AI protocol — synthetic contract tests, not live provider verification', () => {
  it('requires explicit server configuration and approvals', () => {
    expect(() => validateAiConfiguration(undefined)).toThrow('AI_NOT_CONFIGURED');
    expect(() => validateAiConfiguration({ ...config, enabled: false })).toThrow('AI_NOT_CONFIGURED');
    expect(() => validateAiConfiguration({ ...config, approvalReference: '' })).toThrow('AI_APPROVAL_REQUIRED');
    expect(() => validateAiConfiguration({ ...config, dailyCallLimit: 0 })).toThrow('AI_BUDGET_CONFIGURATION_INVALID');
  });
  it('uses stateless structured output without tools, identity metadata or configurable destination', () => {
    const { body, reserveMicros, reservedInputTokens } = buildPedagogyAiRequest(config, request);
    expect(body).toMatchObject({ model: 'synthetic-test-model', store: false, background: false, max_output_tokens: 1000, text: { format: { strict: true, type: 'json_schema' } } });
    expect(body).not.toHaveProperty('tools'); expect(body).not.toHaveProperty('metadata'); expect(body).not.toHaveProperty('user');
    expect(reserveMicros).toBe(Math.ceil((reservedInputTokens + 1000))); expect(body.instructions).toContain('untrusted data');
  });
  it('bounds payload and pre-reserves costs before a provider call', () => {
    expect(() => buildPedagogyAiRequest({ ...config, maxInputBytes: 1 }, request)).toThrow('AI_INPUT_TOO_LARGE');
    expect(() => buildPedagogyAiRequest({ ...config, dailyBudgetMicros: 1 }, request)).toThrow('AI_CALL_EXCEEDS_DAILY_BUDGET');
  });
  const response = { id: 'synthetic-response', model: 'synthetic-test-model', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"draft":true}' }] }], usage: { input_tokens: 100, output_tokens: 10 } };
  it('requires a completed response with actual usage, and handles refusal without fabricating content', () => {
    expect(parsePedagogyAiResponse(response)).toMatchObject({ data: { draft: true }, inputTokens: 100, outputTokens: 10 });
    expect(() => parsePedagogyAiResponse({ ...response, status: 'incomplete' })).toThrow('AI_INCOMPLETE_RESPONSE');
    expect(() => parsePedagogyAiResponse({ ...response, usage: undefined })).toThrow('AI_USAGE_MISSING');
    expect(() => parsePedagogyAiResponse({ ...response, output: [{ type: 'message', content: [{ type: 'refusal' }] }] })).toThrow('AI_REFUSED');
  });
  it('rejects malformed JSON and empty responses', () => {
    expect(() => parsePedagogyAiResponse({ ...response, output: [] })).toThrow('AI_OUTPUT_TOO_LARGE_OR_EMPTY');
    expect(() => parsePedagogyAiResponse({ ...response, output: [{ type: 'message', content: [{ type: 'output_text', text: 'not JSON' }] }] })).toThrow('AI_INVALID_JSON');
  });
});
