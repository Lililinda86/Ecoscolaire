import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), project: 'ecoscolaire-staging' }));
vi.mock('../../functions/node_modules/firebase-admin/lib/index.js', () => ({
  app: () => ({ options: { projectId: state.project } }),
  firestore: () => ({
    collection: (name: string) => ({ doc: (id: string) => {
      const path = name + '/' + id;
      const ref = { path, get: async () => ({ exists: state.docs.has(path), data: () => state.docs.get(path), ref }), update: async (value: object) => { state.docs.set(path, { ...state.docs.get(path), ...value }); } };
      return ref;
    } }),
    runTransaction: async (run: (transaction: unknown) => unknown) => {
      const writes: Array<() => void> = [];
      const result = await run({
        get: (ref: { get: () => unknown }) => ref.get(),
        set: (ref: { path: string }, value: Record<string, unknown>) => writes.push(() => state.docs.set(ref.path, value)),
        create: (ref: { path: string }, value: Record<string, unknown>) => writes.push(() => state.docs.set(ref.path, value)),
      });
      writes.forEach(write => write()); return result;
    },
  }),
}));
vi.mock('../../functions/node_modules/firebase-admin/lib/firestore/index.js', () => ({ FieldValue: { serverTimestamp: () => 'synthetic-server-time' } }));
import { requestStructuredPedagogyAi } from '../../functions/src/pedagogy/aiGateway';
import { PEDAGOGY_SYNTHETIC_TRIAL_ID } from '../../functions/src/pedagogy/aiSyntheticTrial';
const school = 'pedagogy-ai-validation-20260906';
const ledger = 'pedagogyAiBudgets/' + PEDAGOGY_SYNTHETIC_TRIAL_ID;
const request = { purpose: 'weekly_assessment' as const, instructions: 'Synthetic only', content: 'Synthetic lesson', schema: {}, sourceKey: 'synthetic-source' };
const configuration = { enabled: true, provider: 'openai', model: 'gpt-4.1-mini-2025-04-14', version: 1, maxOutputTokens: 2000, maxInputBytes: 10000, dailyCallLimit: 10, dailyBudgetMicros: 2000000, inputPriceMicrosPerMillionTokens: 400000, outputPriceMicrosPerMillionTokens: 1600000, approvalReference: 'unit-synthetic', privacyReviewReference: 'unit-synthetic' };
describe('gateway reservations with simulated transport, NOT real-provider proof', () => {
  beforeEach(() => {
    state.docs.clear(); state.project = 'ecoscolaire-staging';
    state.docs.set('pedagogyAiConfigurations/' + school, configuration);
    vi.stubEnv('PEDAGOGY_AI_SECRET_BINDING_ENABLED', 'true');
    vi.stubEnv('PEDAGOGY_OPENAI_API_KEY', 'synthetic-unit-value-not-a-key');
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('reports observed tokens separately from a conservative cost estimate', async () => {
    const response = { id: 'synthetic-response', model: configuration.model, status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"draft":true}' }] }], usage: { input_tokens: 1000, output_tokens: 100 } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(response) }));
    const result = await requestStructuredPedagogyAi(school, request);
    expect(result).toMatchObject({ inputTokens: 1000, outputTokens: 100, estimatedCostMicros: 560, costBasis: 'observed_tokens_uncached_list_price_upper_bound' });
    expect(result).not.toHaveProperty('actualCostMicros');
    expect(state.docs.get(ledger)?.reservedMicros).toBeGreaterThan(560);
  });
  it('refuses a real-looking school or any non-Staging project before network', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(requestStructuredPedagogyAi('school-not-approved', request)).rejects.toThrow('AI_SYNTHETIC_TRIAL_SCOPE_REQUIRED');
    state.project = 'not-staging';
    await expect(requestStructuredPedagogyAi(school, request)).rejects.toThrow('AI_SYNTHETIC_TRIAL_SCOPE_REQUIRED');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('reserves the global allowance before transport and never refunds uncertainty', async () => {
    const fetcher = vi.fn(async () => {
      expect(state.docs.get(ledger)?.assessmentCalls).toBe(1);
      throw new Error('simulated network uncertainty');
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(requestStructuredPedagogyAi(school, request)).rejects.toThrow('AI_NETWORK_OR_RESPONSE_UNCERTAIN');
    expect(state.docs.get(ledger)?.assessmentCalls).toBe(1);
    await expect(requestStructuredPedagogyAi(school, request)).rejects.toThrow('AI_PREVIOUS_ATTEMPT_REQUIRES_REVIEW');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('denies exhausted global allowance even when the daily budget is empty', async () => {
    state.docs.set(ledger, { reservedMicros: 2000000, preparationCalls: 0, assessmentCalls: 0 });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(requestStructuredPedagogyAi(school, request)).rejects.toThrow('AI_TRIAL_ALLOWANCE_EXHAUSTED');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('blocks altered document bytes before even the token count endpoint', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(requestStructuredPedagogyAi(school, { ...request, purpose: 'preparation_analysis', document: { mimeType: 'application/pdf', bytesBase64: Buffer.from('unapproved').toString('base64') } })).rejects.toThrow('AI_DOCUMENT_NOT_IN_APPROVED_SYNTHETIC_SET');
    expect(fetcher).not.toHaveBeenCalled(); expect(state.docs.has(ledger)).toBe(false);
  });
  it('reserves before preflight and refuses generation when counted tokens exceed reservation', async () => {
    const bytes = readFileSync(new URL('../fixtures/synthetic-pedagogy-ai/pre-fr.pdf', import.meta.url));
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toBe('https://api.openai.com/v1/responses/input_tokens');
      expect(state.docs.get(ledger)?.preparationCalls).toBe(1);
      return { ok: true, json: async () => ({ input_tokens: 9999999 }) };
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(requestStructuredPedagogyAi(school, { ...request, purpose: 'preparation_analysis', document: { mimeType: 'application/pdf', bytesBase64: bytes.toString('base64') } })).rejects.toThrow('AI_TOKEN_COUNT_EXCEEDS_RESERVATION');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.docs.get(ledger)?.preparationCalls).toBe(1);
  });
});
