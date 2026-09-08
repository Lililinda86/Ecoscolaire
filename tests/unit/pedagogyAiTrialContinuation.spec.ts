import { expect, it } from 'vitest';
import { AI_PRIOR_OPERATION_IDS, assertDiagnosedAiContinuation } from '../../functions/src/pedagogy/aiTrialContinuation';
const manifest = { state: 'failed_review_required', runId: '34185299765', sha: 'd42ad3f9248a3e3c09dacf7e91d8f9fef8f7ca99', report: { errorCode: 'SYNTHETIC_TITLE_CHECK_FAILED', cleanupVerified: true, unresolvedConsumption: false } };
const ledger = { trialId: 'synthetic-validation-2026-09-06', preparationCalls: 2, assessmentCalls: 0, reservedMicros: 178000 };
const config = { enabled: false, version: 1, model: 'gpt-4.1-mini-2025-04-14' };
const operations = AI_PRIOR_OPERATION_IDS.map(id => ({ id, schoolId: 'pedagogy-ai-validation-20260906', status: 'succeeded', purpose: 'preparation_analysis', configurationVersion: 1, result: { model: config.model, data: { lessonTitle: null } } }));
it('accepts only the diagnosed completed pair with the original consumed ledger', () => {
  expect(() => assertDiagnosedAiContinuation(manifest, ledger, config, operations)).not.toThrow();
});
it('rejects replay, uncertain costs, resets, extra calls and missing operations', () => {
  for (const changed of [{ ...manifest, continuationClaimed: true }, { ...manifest, state: 'running' }, { ...manifest, report: { ...manifest.report, unresolvedConsumption: true } }]) {
    expect(() => assertDiagnosedAiContinuation(changed, ledger, config, operations)).toThrow();
  }
  for (const changed of [{ ...ledger, reservedMicros: 0 }, { ...ledger, preparationCalls: 3 }, { ...ledger, assessmentCalls: 1 }]) {
    expect(() => assertDiagnosedAiContinuation(manifest, changed, config, operations)).toThrow();
  }
  expect(() => assertDiagnosedAiContinuation(manifest, ledger, { ...config, enabled: true }, operations)).toThrow();
  expect(() => assertDiagnosedAiContinuation(manifest, ledger, config, operations.slice(0, 1))).toThrow();
  expect(() => assertDiagnosedAiContinuation(manifest, ledger, config, [{ ...operations[0], status: 'processing' }, operations[1]])).toThrow();
});
