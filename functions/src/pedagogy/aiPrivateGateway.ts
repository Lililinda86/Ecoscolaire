import * as functions from 'firebase-functions';
import { pedagogyAiRuntimeSecrets } from './aiRuntime';
import { requestStructuredPedagogyAi } from './aiGateway';

// Only this identity holds secretAccessor. It has no Storage, Auth or delete rights.
// IAM authenticates the existing Staging Functions identity, never allUsers.
export const pedagogySyntheticAiGateway = functions.runWith({
  timeoutSeconds: 180, memory: '512MB', maxInstances: 1,
  serviceAccount: 'pedagogy-ai-staging@ecoscolaire-staging.iam.gserviceaccount.com',
  invoker: ['ecoscolaire-staging@appspot.gserviceaccount.com'],
  secrets: pedagogyAiRuntimeSecrets(),
}).https.onRequest(async (req, res) => {
  if (process.env.GCLOUD_PROJECT !== 'ecoscolaire-staging' || process.env.FUNCTIONS_EMULATOR === 'true') { res.status(403).json({ errorCode: 'AI_SYNTHETIC_TRIAL_SCOPE_REQUIRED' }); return; }
  if (req.method !== 'POST' || !req.is('application/json') || req.rawBody.length > 1600000) { res.status(400).json({ errorCode: 'AI_PRIVATE_REQUEST_INVALID' }); return; }
  const { schoolId, request } = req.body || {};
  if (schoolId !== 'pedagogy-ai-validation-20260906' || !request || !['preparation_analysis', 'weekly_assessment'].includes(request.purpose) ||
      typeof request.sourceKey !== 'string' || request.sourceKey.length > 500 || typeof request.instructions !== 'string' || typeof request.content !== 'string' || !request.schema) {
    res.status(400).json({ errorCode: 'AI_PRIVATE_REQUEST_INVALID' }); return;
  }
  try { res.json(await requestStructuredPedagogyAi(schoolId, request)); }
  catch (error) { res.status(422).json({ errorCode: error instanceof Error && /^AI_[A-Z_0-9]+$/.test(error.message) ? error.message : 'AI_PRIVATE_GATEWAY_UNCERTAIN' }); }
});
