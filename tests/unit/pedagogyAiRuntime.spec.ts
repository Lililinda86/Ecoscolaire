import { describe, expect, it } from 'vitest';
import { pedagogyAiRuntimeEnabled, pedagogyAiRuntimeSecrets } from '../../functions/src/pedagogy/aiRuntime';
describe('AI deployment capability fails closed without a configured secret', () => {
  it.each([undefined, '', 'false', '1', 'TRUE'])('disabled for %s', value => {
    const environment = { GCLOUD_PROJECT: 'ecoscolaire-staging', PEDAGOGY_AI_SECRET_BINDING_ENABLED: value };
    expect(pedagogyAiRuntimeEnabled(environment)).toBe(false);
    expect(pedagogyAiRuntimeSecrets(environment)).toEqual([]);
  });
  it('only explicitly enabled deployment binds the private secret', () => {
    expect(pedagogyAiRuntimeSecrets({ GCLOUD_PROJECT: 'ecoscolaire-staging', PEDAGOGY_AI_SECRET_BINDING_ENABLED: 'true' })).toEqual(['PEDAGOGY_OPENAI_API_KEY']);
  });
  it('binds during Firebase discovery before dotenv is loaded', () => {
    expect(pedagogyAiRuntimeSecrets({ GCLOUD_PROJECT: 'ecoscolaire-staging', FUNCTIONS_CONTROL_API: 'true' })).toEqual(['PEDAGOGY_OPENAI_API_KEY']);
    expect(pedagogyAiRuntimeEnabled({ GCLOUD_PROJECT: 'ecoscolaire-staging', FUNCTIONS_CONTROL_API: 'true' })).toBe(false);
  });
  it.each([undefined, 'demo-ecoscolaire', 'ecoscolaire-production'])('never binds outside Staging: %s', project => {
    expect(pedagogyAiRuntimeSecrets({ GCLOUD_PROJECT: project, FUNCTIONS_CONTROL_API: 'true', PEDAGOGY_AI_SECRET_BINDING_ENABLED: 'true' })).toEqual([]);
  });
  it('never binds in emulators even with both flags', () => {
    expect(pedagogyAiRuntimeSecrets({ GCLOUD_PROJECT: 'ecoscolaire-staging', FUNCTIONS_EMULATOR: 'true', FUNCTIONS_CONTROL_API: 'true', PEDAGOGY_AI_SECRET_BINDING_ENABLED: 'true' })).toEqual([]);
  });
});
