import * as admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { buildPedagogyAiRequest, parsePedagogyAiResponse, PEDAGOGY_AI_PROTOCOL_VERSION, StructuredPedagogyRequest, validateAiConfiguration } from './aiProtocol';
import { pedagogyAiRuntimeEnabled } from './aiRuntime';
import { PEDAGOGY_SYNTHETIC_TRIAL_ID, PEDAGOGY_SYNTHETIC_TRIAL_MODEL, reserveSyntheticTrial, type SyntheticTrialLedger } from './aiSyntheticTrial';

// Server-only collections. Secrets, prompts, file contents and pupil data never enter logs.
// Uncertain paid requests are not replayed automatically: the reservation remains consumed.
export async function requestStructuredPedagogyAi(schoolId: string, request: StructuredPedagogyRequest) {
  if (!pedagogyAiRuntimeEnabled()) throw new Error('AI_RUNTIME_DISABLED');
  const db = admin.firestore();
  // Current external-processing authorization covers this synthetic trial only.
  // Neither enabling the runtime nor creating another daily budget expands it.
  const projectId = admin.app().options.projectId || process.env.GCLOUD_PROJECT;
  if (projectId !== 'ecoscolaire-staging' || schoolId !== 'pedagogy-ai-validation-20260906') throw new Error('AI_SYNTHETIC_TRIAL_SCOPE_REQUIRED');
  const configSnap = await db.collection('pedagogyAiConfigurations').doc(schoolId).get();
  const config = validateAiConfiguration(configSnap.data());
  if (config.model !== PEDAGOGY_SYNTHETIC_TRIAL_MODEL || config.inputPriceMicrosPerMillionTokens < 400000 || config.outputPriceMicrosPerMillionTokens < 1600000) throw new Error('AI_TRIAL_MODEL_OR_PRICE_INVALID');
  const apiKey = process.env.PEDAGOGY_OPENAI_API_KEY;
  if (!apiKey) throw new Error('AI_PROVIDER_SECRET_MISSING');
  const built = buildPedagogyAiRequest(config, request);
  const id = createHash('sha256').update(JSON.stringify([schoolId, request.purpose, request.sourceKey, config.version, built.requestHash, PEDAGOGY_AI_PROTOCOL_VERSION])).digest('hex');
  const ref = db.collection('pedagogyAiOperations').doc(id);
  // Global, not per-school/day/configuration. Never remove this consumed ledger
  // with disposable fixtures: uncertain requests still consume their allowance.
  const trialRef = db.collection('pedagogyAiBudgets').doc(PEDAGOGY_SYNTHETIC_TRIAL_ID);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const budgetRef = db.collection('pedagogyAiBudgets').doc(createHash('sha256').update(`${schoolId}|${day}`).digest('hex'));
  const claim = await db.runTransaction(async transaction => {
    const [existing, budgetSnap, currentConfig, trialSnap] = await Promise.all([transaction.get(ref), transaction.get(budgetRef), transaction.get(configSnap.ref), transaction.get(trialRef)]);
    if (currentConfig.data()?.version !== config.version || currentConfig.data()?.enabled !== true) throw new Error('AI_CONFIGURATION_CHANGED');
    if (existing.exists) {
      const previous = existing.data()!;
      if (previous.status === 'succeeded') return { cached: true as const, result: previous.result };
      throw new Error(previous.status === 'processing' ? 'AI_REQUEST_IN_PROGRESS_OR_UNCERTAIN' : 'AI_PREVIOUS_ATTEMPT_REQUIRES_REVIEW');
    }
    const budget = budgetSnap.data() || { reservedMicros: 0, calls: 0 };
    const nextTrial = reserveSyntheticTrial((trialSnap.data() || { reservedMicros: 0, preparationCalls: 0, assessmentCalls: 0 }) as SyntheticTrialLedger, request.purpose, built.reserveMicros);
    if (budget.calls >= config.dailyCallLimit || budget.reservedMicros + built.reserveMicros > config.dailyBudgetMicros) throw new Error('AI_DAILY_BUDGET_EXHAUSTED');
    transaction.set(budgetRef, { schoolId, day, calls: budget.calls + 1, reservedMicros: budget.reservedMicros + built.reserveMicros, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(trialRef, { ...nextTrial, trialId: PEDAGOGY_SYNTHETIC_TRIAL_ID, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(ref, { schoolId, purpose: request.purpose, sourceKeyHash: createHash('sha256').update(request.sourceKey).digest('hex'), requestHash: built.requestHash,
      provider: 'openai', model: config.model, configurationVersion: config.version, protocolVersion: PEDAGOGY_AI_PROTOCOL_VERSION,
      status: 'processing', reservedMicros: built.reserveMicros, startedAt: FieldValue.serverTimestamp() });
    return { cached: false as const, result: null };
  });
  if (claim.cached) return { ...claim.result, operationId: id, cached: true };
  try {
    if (built.requiresTokenCount) {
      const count = await fetch('https://api.openai.com/v1/responses/input_tokens', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: built.body.model, instructions: built.body.instructions, input: built.body.input, text: built.body.text }),
      });
      if (!count.ok) throw new Error(`AI_TOKEN_COUNT_HTTP_${count.status}`);
      const counted = await count.json() as { input_tokens?: number };
      if (!Number.isSafeInteger(counted.input_tokens) || counted.input_tokens! < 0 || counted.input_tokens! > built.reservedInputTokens) throw new Error('AI_TOKEN_COUNT_EXCEEDS_RESERVATION');
    }
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(90000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Client-Request-Id': id }, body: JSON.stringify(built.body)
    });
    if (!response.ok) throw new Error(`AI_HTTP_${response.status}`);
    const wire = await response.text();
    if (Buffer.byteLength(wire, 'utf8') > 500000) throw new Error('AI_RESPONSE_TOO_LARGE');
    const parsed = parsePedagogyAiResponse(JSON.parse(wire));
    if (parsed.inputTokens > built.reservedInputTokens || parsed.outputTokens > config.maxOutputTokens) {
      await configSnap.ref.update({ enabled: false, disabledReason: 'AI_RESERVATION_BOUND_EXCEEDED', disabledAt: FieldValue.serverTimestamp() });
      throw new Error('AI_RESERVATION_BOUND_EXCEEDED');
    }
    const actualCostMicros = Math.ceil((parsed.inputTokens * config.inputPriceMicrosPerMillionTokens + parsed.outputTokens * config.outputPriceMicrosPerMillionTokens) / 1000000);
    const result = { ...parsed, provider: 'openai', protocolVersion: PEDAGOGY_AI_PROTOCOL_VERSION, actualCostMicros };
    await ref.update({ status: 'succeeded', result, completedAt: FieldValue.serverTimestamp() });
    return { ...result, operationId: id, cached: false };
  } catch (error) {
    const code = error instanceof Error && /^AI_[A-Z_0-9]+$/.test(error.message) ? error.message : 'AI_NETWORK_OR_RESPONSE_UNCERTAIN';
    await ref.update({ status: 'failed_or_uncertain', errorCode: code, completedAt: FieldValue.serverTimestamp() });
    throw new Error(code);
  }
}
