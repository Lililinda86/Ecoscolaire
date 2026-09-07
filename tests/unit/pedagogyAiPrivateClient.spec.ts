import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ getIdTokenClient: vi.fn() }));
vi.mock('../../functions/node_modules/google-auth-library/build/src/index.js', () => ({ GoogleAuth: class { getIdTokenClient = auth.getIdTokenClient; } }));
import { requestPrivatePedagogyAi } from '../../functions/src/pedagogy/aiPrivateClient';
const school = 'pedagogy-ai-validation-20260906';
const request = { purpose: 'weekly_assessment' as const, sourceKey: 'unit-only', instructions: 'Synthetic', content: 'Synthetic', schema: {} };
describe('private IAM transport (simulated, not live AI proof)', () => {
  beforeEach(() => {
    vi.stubEnv('GCLOUD_PROJECT', 'ecoscolaire-staging'); vi.stubEnv('FUNCTIONS_EMULATOR', 'false'); vi.stubEnv('PEDAGOGY_AI_SECRET_BINDING_ENABLED', 'true');
    auth.getIdTokenClient.mockReset().mockResolvedValue({ getRequestHeaders: async () => ({ Authorization: 'Bearer unit-identity-not-a-token' }) });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it.each(['wrong-project', 'demo-ecoscolaire'])('blocks project %s before credentials or network', async project => {
    vi.stubEnv('GCLOUD_PROJECT', project);
    await expect(requestPrivatePedagogyAi(school, request)).rejects.toThrow('AI_SYNTHETIC_TRIAL_SCOPE_REQUIRED');
    expect(auth.getIdTokenClient).not.toHaveBeenCalled();
  });
  it('blocks ordinary schools', async () => {
    await expect(requestPrivatePedagogyAi('ordinary-school', request)).rejects.toThrow('AI_SYNTHETIC_TRIAL_SCOPE_REQUIRED');
    expect(auth.getIdTokenClient).not.toHaveBeenCalled();
  });
  it('does not retry uncertain internal requests or expose credentials', async () => {
    const transport = vi.fn().mockRejectedValue(new Error('private transport details must not escape')); vi.stubGlobal('fetch', transport);
    await expect(requestPrivatePedagogyAi(school, request)).rejects.toThrow('AI_PRIVATE_GATEWAY_UNCERTAIN');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('targets only the fixed private Staging endpoint', async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ operationId: 'unit', cached: false }) }); vi.stubGlobal('fetch', transport);
    await expect(requestPrivatePedagogyAi(school, request)).resolves.toMatchObject({ operationId: 'unit' });
    expect(auth.getIdTokenClient).toHaveBeenCalledWith('https://us-central1-ecoscolaire-staging.cloudfunctions.net/pedagogySyntheticAiGateway');
    expect(transport.mock.calls[0][1]).toMatchObject({ method: 'POST', redirect: 'error' });
  });
});
