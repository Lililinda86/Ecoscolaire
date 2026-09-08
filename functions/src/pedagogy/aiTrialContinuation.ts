export const AI_CONTINUATION_CONFIRMATION = 'CONTINUE_PEDAGOGY_AI_34185299765';
export const AI_ASSESSMENT_CONTINUATION_CONFIRMATION = 'CONTINUE_PEDAGOGY_ASSESSMENTS_34187407004';
export const AI_PRIOR_OPERATION_IDS = [
  '614b135af092b7cf1894e7d2bf23b0204dca4b443d9cc7df194d4377f8e39750',
  '8bb879e6ec1181fdd081d079b039718a26e341558bf94610c6e0412958d714ec',
] as const;
export const AI_ALL_DOCUMENT_OPERATION_IDS = [...AI_PRIOR_OPERATION_IDS,
  '1a3286470863e0a3a4790e5d4e077cda663b768cda59efd960cca5826505c608',
  '4c96864876a9684c59334719fb797bdd47ecbe46c3d2ce9aec37fb6aee8fd172',
  '6257d2a1a4f5e54abd36425101c499ad999af1854133c5044b5fa4db1e3f1623',
] as const;
/** One diagnosed continuation, never a budget reset or a retry of consumed requests. */
type Manifest = { state?: string; continuationClaimed?: boolean; runId?: string; sha?: string; report?: { errorCode?: string; cleanupVerified?: boolean; unresolvedConsumption?: boolean } };
type Ledger = { trialId?: string; preparationCalls?: number; assessmentCalls?: number; reservedMicros?: number };
type Configuration = { enabled?: boolean; version?: number; model?: string };
type Operation = { id?: string; schoolId?: string; status?: string; purpose?: string; configurationVersion?: number; result?: { model?: string; data?: unknown } };
type AssessmentManifest = Manifest & { continuationRunId?: string; continuationSha?: string; assessmentContinuationClaimed?: boolean };
type FridayConfiguration = { enabled?: boolean; syntheticTrial?: string; schoolId?: string; controlledTrialFriday?: string };
export function assertDiagnosedAssessmentContinuation(manifest: AssessmentManifest, ledger: Ledger, config: Configuration, operations: Operation[], friday: FridayConfiguration) {
  if (manifest.state !== 'failed_review_required' || manifest.continuationClaimed !== true || manifest.assessmentContinuationClaimed ||
      manifest.runId !== '34185299765' || manifest.sha !== 'd42ad3f9248a3e3c09dacf7e91d8f9fef8f7ca99' ||
      manifest.continuationRunId !== '34187407004' || manifest.continuationSha !== '1e872bff59426c8004ca1990875291c902072569' ||
      manifest.report?.errorCode !== 'FRIDAY_CONTROLLED_TRIGGER_FAILED' || manifest.report?.cleanupVerified !== true || manifest.report?.unresolvedConsumption !== false ||
      ledger.trialId !== 'synthetic-validation-2026-09-06' || ledger.preparationCalls !== 5 || ledger.assessmentCalls !== 0 || ledger.reservedMicros !== 445000 ||
      config.enabled !== false || config.version !== 1 || config.model !== 'gpt-4.1-mini-2025-04-14' ||
      friday.enabled !== false || friday.syntheticTrial !== ledger.trialId || friday.schoolId !== 'pedagogy-ai-validation-20260906' ||
      friday.controlledTrialFriday !== '2026-09-04T12:00:00Z' || operations.length !== 5 ||
      AI_ALL_DOCUMENT_OPERATION_IDS.some(id => !operations.some(op => op.id === id && op.schoolId === friday.schoolId &&
        op.status === 'succeeded' && op.purpose === 'preparation_analysis' && op.configurationVersion === 1 && op.result?.model === config.model && op.result?.data))) {
    throw new Error('AI_ASSESSMENT_CONTINUATION_STATE_NOT_APPROVED');
  }
}
export function assertDiagnosedAiContinuation(manifest: Manifest, ledger: Ledger, config: Configuration, operations: Operation[]) {
  if (manifest.state !== 'failed_review_required' || manifest.continuationClaimed ||
      manifest.runId !== '34185299765' || manifest.sha !== 'd42ad3f9248a3e3c09dacf7e91d8f9fef8f7ca99' ||
      manifest.report?.errorCode !== 'SYNTHETIC_TITLE_CHECK_FAILED' ||
      manifest.report?.cleanupVerified !== true || manifest.report?.unresolvedConsumption !== false ||
      ledger.trialId !== 'synthetic-validation-2026-09-06' ||
      ledger.preparationCalls !== 2 || ledger.assessmentCalls !== 0 || ledger.reservedMicros !== 178000 ||
      config.enabled !== false || config.version !== 1 || config.model !== 'gpt-4.1-mini-2025-04-14' ||
      operations.length !== 2 || AI_PRIOR_OPERATION_IDS.some(id => !operations.some(op =>
        op.id === id && op.schoolId === 'pedagogy-ai-validation-20260906' &&
        op.status === 'succeeded' && op.purpose === 'preparation_analysis' &&
        op.configurationVersion === 1 && op.result?.model === config.model && op.result?.data))) {
    throw new Error('AI_CONTINUATION_STATE_NOT_APPROVED');
  }
}
