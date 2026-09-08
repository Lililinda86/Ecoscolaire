import { describe, expect, it } from 'vitest';
import { reserveSyntheticTrial } from '../../functions/src/pedagogy/aiSyntheticTrial';
const empty = { reservedMicros: 0, preparationCalls: 0, assessmentCalls: 0 };
it('permits only two additional assessments under explicit non-resetting revalidation', () => {
  const prior = { reservedMicros: 496062, preparationCalls: 5, assessmentCalls: 5 };
  const six = reserveSyntheticTrial(prior, 'weekly_assessment', 20000, true);
  const seven = reserveSyntheticTrial(six, 'weekly_assessment', 20000, true);
  expect(seven).toEqual({ reservedMicros: 536062, preparationCalls: 5, assessmentCalls: 7 });
  expect(() => reserveSyntheticTrial(seven, 'weekly_assessment', 1, true)).toThrow('AI_TRIAL_ALLOWANCE_EXHAUSTED');
  expect(() => reserveSyntheticTrial(prior, 'preparation_analysis', 1, true)).toThrow('AI_REVALIDATION_STATE_INVALID');
  expect(() => reserveSyntheticTrial(empty, 'weekly_assessment', 1, true)).toThrow('AI_REVALIDATION_STATE_INVALID');
});
describe('single authorized synthetic trial allowance (no provider calls)', () => {
  it('permits exactly five document and five assessment reservations within USD 2', () => {
    let ledger = empty;
    for (let i = 0; i < 5; i++) {
      ledger = reserveSyntheticTrial(ledger, 'preparation_analysis', 200000);
      ledger = reserveSyntheticTrial(ledger, 'weekly_assessment', 200000);
    }
    expect(ledger).toEqual({ reservedMicros: 2000000, preparationCalls: 5, assessmentCalls: 5 });
    expect(empty.reservedMicros).toBe(0);
    expect(() => reserveSyntheticTrial(ledger, 'weekly_assessment', 1)).toThrow('AI_TRIAL_ALLOWANCE_EXHAUSTED');
  });
  it('does not exchange document and generation quotas or allow remediation', () => {
    expect(() => reserveSyntheticTrial({ ...empty, preparationCalls: 5 }, 'preparation_analysis', 1)).toThrow('AI_TRIAL_ALLOWANCE_EXHAUSTED');
    expect(() => reserveSyntheticTrial({ ...empty, assessmentCalls: 5 }, 'weekly_assessment', 1)).toThrow('AI_TRIAL_ALLOWANCE_EXHAUSTED');
    expect(() => reserveSyntheticTrial(empty, 'remediation', 1)).toThrow('AI_TRIAL_PURPOSE_NOT_APPROVED');
  });
  it('blocks global budget excess independently of date, school or daily quota', () => {
    expect(() => reserveSyntheticTrial({ ...empty, reservedMicros: 1999999 }, 'weekly_assessment', 2)).toThrow('AI_TRIAL_ALLOWANCE_EXHAUSTED');
  });
  it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid ledger values %s', value => {
    expect(() => reserveSyntheticTrial({ ...empty, reservedMicros: value }, 'weekly_assessment', 1)).toThrow('AI_TRIAL_LEDGER_INVALID');
    expect(() => reserveSyntheticTrial(empty, 'weekly_assessment', value)).toThrow('AI_TRIAL_LEDGER_INVALID');
  });
  it('rejects unpriced calls', () => {
    expect(() => reserveSyntheticTrial(empty, 'weekly_assessment', 0)).toThrow('AI_TRIAL_LEDGER_INVALID');
  });
});
