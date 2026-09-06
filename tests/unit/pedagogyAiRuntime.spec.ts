import { describe, expect, it } from 'vitest';
import { pedagogyAiRuntimeEnabled, pedagogyAiRuntimeSecrets } from '../../functions/src/pedagogy/aiRuntime';
describe('AI deployment capability fails closed without a configured secret', () => {
  it.each([undefined, '', 'false', '1', 'TRUE'])('disabled for %s', value => {
    const environment = { PEDAGOGY_AI_SECRET_BINDING_ENABLED: value };
    expect(pedagogyAiRuntimeEnabled(environment)).toBe(false);
    expect(pedagogyAiRuntimeSecrets(environment)).toEqual([]);
  });
  it('only explicitly enabled deployment binds the private secret', () => {
    expect(pedagogyAiRuntimeSecrets({ PEDAGOGY_AI_SECRET_BINDING_ENABLED: 'true' })).toEqual(['PEDAGOGY_OPENAI_API_KEY']);
  });
});
