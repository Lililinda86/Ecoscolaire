import { GoogleAuth } from 'google-auth-library';
import { pedagogyAiRuntimeEnabled } from './aiRuntime';
import type { StructuredPedagogyRequest } from './aiProtocol';
import type { requestStructuredPedagogyAi } from './aiGateway';

const endpoint = 'https://us-central1-ecoscolaire-staging.cloudfunctions.net/pedagogySyntheticAiGateway';
/** No provider secret or Storage permission is shared with the private gateway. */
export async function requestPrivatePedagogyAi(schoolId: string, request: StructuredPedagogyRequest): Promise<Awaited<ReturnType<typeof requestStructuredPedagogyAi>>> {
  if (!pedagogyAiRuntimeEnabled()) throw new Error('AI_RUNTIME_DISABLED');
  if (process.env.GCLOUD_PROJECT !== 'ecoscolaire-staging' || schoolId !== 'pedagogy-ai-validation-20260906' || process.env.FUNCTIONS_EMULATOR === 'true') throw new Error('AI_SYNTHETIC_TRIAL_SCOPE_REQUIRED');
  try {
    const client = await new GoogleAuth().getIdTokenClient(endpoint);
    const headers = await client.getRequestHeaders(endpoint);
    // Native fetch: one attempt, no transport retry of a potentially paid operation.
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(150000),
      headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolId, request }),
    });
    if (!response.ok) {
      const result = await response.json() as { errorCode?: string };
      throw new Error(result.errorCode && /^AI_[A-Z_0-9]+$/.test(result.errorCode) ? result.errorCode : 'AI_PRIVATE_GATEWAY_REJECTED');
    }
    return await response.json();
  } catch (error) {
    // Never expose identity tokens, request contents or SDK transport errors.
    throw new Error(error instanceof Error && /^AI_[A-Z_0-9]+$/.test(error.message) ? error.message : 'AI_PRIVATE_GATEWAY_UNCERTAIN');
  }
}
