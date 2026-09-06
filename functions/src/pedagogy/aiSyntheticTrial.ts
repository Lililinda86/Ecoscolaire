/** A single non-resetting allowance for the explicitly approved synthetic trial.
 * Keep this ledger after fixture cleanup, including failed/uncertain reservations.
 * This policy does not attest that arbitrary input bytes are synthetic.
 */
export const PEDAGOGY_SYNTHETIC_TRIAL_ID = 'synthetic-validation-2026-09-06';
export const PEDAGOGY_SYNTHETIC_TRIAL_MODEL = 'gpt-4.1-mini-2025-04-14';
export interface SyntheticTrialLedger {
  reservedMicros: number;
  preparationCalls: number;
  assessmentCalls: number;
}
export function reserveSyntheticTrial(
  previous: SyntheticTrialLedger,
  purpose: string,
  reserveMicros: number,
): SyntheticTrialLedger {
  if (![previous.reservedMicros, previous.preparationCalls, previous.assessmentCalls, reserveMicros]
    .every(value => Number.isSafeInteger(value) && value >= 0) || reserveMicros === 0) throw new Error('AI_TRIAL_LEDGER_INVALID');
  if (purpose !== 'preparation_analysis' && purpose !== 'weekly_assessment') throw new Error('AI_TRIAL_PURPOSE_NOT_APPROVED');
  const next = {
    reservedMicros: previous.reservedMicros + reserveMicros,
    preparationCalls: previous.preparationCalls + (purpose === 'preparation_analysis' ? 1 : 0),
    assessmentCalls: previous.assessmentCalls + (purpose === 'weekly_assessment' ? 1 : 0),
  };
  if (next.reservedMicros > 2_000_000 || next.preparationCalls > 5 || next.assessmentCalls > 5) throw new Error('AI_TRIAL_ALLOWANCE_EXHAUSTED');
  return next;
}
