import { describe, expect, it } from 'vitest';
import { defaultPedagogyPolicy, localEducationStage, masteryFromEvidence, parsePedagogyPolicy, type LearningEvidence } from '../../functions/src/pedagogy/pedagogyPolicy';
describe('Formats préscolaires et preuves de maîtrise', () => {
  it.each(['Maternelle 1', 'Maternelle Petite Section', 'Nursery 3', 'Grande section'])('uses observations for local preschool %s without asserting official equivalence', name => expect(defaultPedagogyPolicy({ name }).assessmentMode).toBe('observation'));
  it.each(['Pre-Nursery', 'Pré-maternelle'])('keeps local pre-nursery %s separate', name => expect(localEducationStage({ name })).toBe('pre_nursery'));
  it('preserves old default primary /20 and English language', () => expect(defaultPedagogyPolicy({ name: 'Class 3', type: 'anglophone' })).toMatchObject({ totalPoints: 20, language: 'en', stage: 'primary' }));
  it('forbids numeric preschool policy', () => expect(() => parsePedagogyPolicy({ ...defaultPedagogyPolicy({ name: 'Nursery 1' }), assessmentMode: 'numeric', totalPoints: 20 }, { name: 'Nursery 1' }, 2)).toThrow('PRESCHOOL_REQUIRES_NON_NUMERIC_OBSERVATION'));
  const policy = defaultPedagogyPolicy({ name: 'CE1' }).mastery;
  const row = (id: string, date: string): LearningEvidence => ({ id, competencyId: 'verified-competency', sourceId: id, date, resultStatus: 'scored', score: 8, maxScore: 10 });
  it('does not infer a competency from a global grade without a verified mapping', () => expect(masteryFromEvidence('verified-competency', [{ ...row('1', '2026-09-01'), competencyId: null }], policy).state).toBe('insufficient_data'));
  it('does not conclude from one observation or repeated copies of the same source', () => {
    expect(masteryFromEvidence('verified-competency', [row('1', '2026-09-01')], policy).state).toBe('insufficient_data');
    expect(masteryFromEvidence('verified-competency', [row('1', '2026-09-01'), row('1', '2026-09-02'), row('1', '2026-09-03')], policy).state).toBe('insufficient_data');
  });
  it('distinguishes absence and non-observation from zero', () => {
    const rows = [row('1', '2026-09-01'), row('2', '2026-09-02'), { ...row('3', '2026-09-03'), resultStatus: 'absent' as const }, { ...row('4', '2026-09-04'), resultStatus: 'observation' as const, observation: 'not_observed' as const }];
    expect(masteryFromEvidence('verified-competency', rows, policy)).toMatchObject({ state: 'insufficient_data', evidenceCount: 2 });
    expect(masteryFromEvidence('verified-competency', [...rows, { ...row('5', '2026-09-05'), score: 0 }], policy).evidenceCount).toBe(3);
  });
  it('requires distinct dates and yields a traceable policy result', () => {
    expect(masteryFromEvidence('verified-competency', [row('1', '2026-09-01'), row('2', '2026-09-01'), row('3', '2026-09-01')], policy).state).toBe('insufficient_data');
    expect(masteryFromEvidence('verified-competency', [row('1', '2026-09-01'), row('2', '2026-09-02'), row('3', '2026-09-03')], policy)).toMatchObject({ state: 'acquired', policyVersion: 1, evidenceCount: 3 });
  });
});
