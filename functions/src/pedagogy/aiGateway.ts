import * as admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { buildPedagogyAiRequest, parsePedagogyAiResponse, PEDAGOGY_AI_PROTOCOL_VERSION, StructuredPedagogyRequest, validateAiConfiguration } from './aiProtocol';
import { pedagogyAiRuntimeEnabled } from './aiRuntime';

// Server-only collections. Secrets, prompts, file contents and pupil data never enter logs.
// Uncertain paid requests are not replayed automatically: the reservation remains consumed.
export async function requestStructuredPedagogyAi(schoolId: string, request: StructuredPedagogyRequest) {
  if (!pedagogyAiRuntimeEnabled()) throw new Error('AI_RUNTIME_DISABLED');
  const db = admin.firestore();
  const configSnap = await db.collection('pedagogyAiConfigurations').doc(schoolId).get();
  const config = validateAiConfiguration(configSnap.data());
  const apiKey = process.env.PEDAGOGY_OPENAI_API_KEY;
  if (!apiKey) throw new Error('AI_PROVIDER_SECRET_MISSING');
  const built = buildPedagogyAiRequest(config, request);
  const id = createHash('sha256').update(JSON.stringify([schoolId, request.purpose, request.sourceKey, config.version, built.requestHash, PEDAGOGY_AI_PROTOCOL_VERSION])).digest('hex');
  const ref = db.collection('pedagogyAiOperations').doc(id);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const budgetRef = db.collection('pedagogyAiBudgets').doc(createHash('sha256').update(`${schoolId}|${day}`).digest('hex'));
  const claim = await db.runTransaction(async transaction => {
    const [existing, budgetSnap, currentConfig] = await Promise.all([transaction.get(ref), transaction.get(budgetRef), transaction.get(configSnap.ref)]);
    if (currentConfig.data()?.version !== config.version || currentConfig.data()?.enabled !== true) throw new Error('AI_CONFIGURATION_CHANGED');
    if (existing.exists) {
      const previous = existing.data()!;
      if (previous.status === 'succeeded') return { cached: true as const, result: previous.result };
      throw new Error(previous.status === 'processing' ? 'AI_REQUEST_IN_PROGRESS_OR_UNCERTAIN' : 'AI_PREVIOUS_ATTEMPT_REQUIRES_REVIEW');
    }
    const budget = budgetSnap.data() || { reservedMicros: 0, calls: 0 };
    if (budget.calls >= config.dailyCallLimit || budget.reservedMicros + built.reserveMicros > config.dailyBudgetMicros) throw new Error('AI_DAILY_BUDGET_EXHAUSTED');
    transaction.set(budgetRef, { schoolId, day, calls: budget.calls + 1, reservedMicros: budget.reservedMicros + built.reserveMicros, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(ref, { schoolId, purpose: request.purpose, sourceKeyHash: createHash('sha256').update(request.sourceKey).digest('hex'), requestHash: built.requestHash,
      provider: 'openai', model: config.model, configurationVersion: config.version, protocolVersion: PEDAGOGY_AI_PROTOCOL_VERSION,
      status: 'processing', reservedMicros: built.reserveMicros, startedAt: FieldValue.serverTimestamp() });
    return { cached: false as const, result: null };
  });
  if (claim.cached) return { ...claim.result, operationId: id, cached: true };
  try {
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
