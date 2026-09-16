import { describe, expect, it } from 'vitest';
import { preschoolReviewProposal, type PreschoolPreparation } from '../../functions/src/pedagogy/preschoolReviewGenerator';
import { defaultPedagogyPolicy } from '../../functions/src/pedagogy/pedagogyPolicy';
import { parseTeachingDeclaration } from '../../functions/src/pedagogy/teachingEvidence';
const week = { weekStartDate: '2026-09-14', weekEndDate: '2026-09-18' };
function preparation(status = 'taught'): PreschoolPreparation {
  const value: PreschoolPreparation = { id: 'preparation', version: 2, subjectId: 'domain', subjectName: 'Communication', status: 'validated', currentUploadId: 'upload', reviewData: { lessonTitle: 'Familiar objects', objective: 'Name a familiar object', lessonSteps: 'Name the cup. Name the ball.' } };
  value.teachingConfirmation = { ...parseTeachingDeclaration({ status, effectiveDate: '2026-09-15', excerpts: ['Name the cup.'] }, value, week, '2026-09-16'), id: 'declaration', declaredByTeacherStaffId: 'teacher', recordedBy: 'secretary' }; return value;
}
describe('Same preschool pathway: qualitative review from confirmed activities only', () => {
  it.each([
    ['fr-preschool-pre', 'francophone', 'fr'], ['fr-preschool-ps', 'francophone', 'fr'],
    ['en-nursery-pre', 'anglophone', 'en'], ['en-nursery-1', 'anglophone', 'en'],
  ])('supports %s without invented results or numeric scores', (catalogLevelId, section, language) => {
    const proposal = preschoolReviewProposal([preparation()], defaultPedagogyPolicy({ catalogLevelId, section }));
    expect(proposal.language).toBe(language); expect(proposal.activities).toHaveLength(1); expect(proposal.totalPoints).toBeNull();
    expect(proposal.teacherValidated).toBe(false); expect(proposal.observationRecorded).toBe(false);
    expect(proposal.observationStates).toEqual(['not_observed', 'discovering', 'developing', 'acquired']);
    expect(proposal.generatorProvider).toBe('deterministic-no-provider');
  });
  it.each(['unconfirmed', 'postponed', 'not_taught', 'cancelled', 'replaced'])('excludes %s', status => {
    expect(preschoolReviewProposal([preparation(status)], defaultPedagogyPolicy({ catalogLevelId: 'fr-preschool-pre' })).activities).toHaveLength(0);
  });
  it('partial realization never includes the general objective or unrealized portion', () => {
    const proposal = preschoolReviewProposal([preparation('partially_taught')], defaultPedagogyPolicy({ catalogLevelId: 'en-nursery-pre' }));
    expect(proposal.activities[0].confirmedContent).toBe('Name the cup.'); expect(JSON.stringify(proposal)).not.toContain('ball');
    expect(JSON.stringify(proposal)).not.toContain('Name a familiar object');
  });
  it('excludes stale confirmation, rejects numeric policy and duplicate sources', () => {
    const value = preparation(); value.currentUploadId = 'new-upload';
    const policy = defaultPedagogyPolicy({ catalogLevelId: 'fr-preschool-pre' });
    expect(preschoolReviewProposal([value], policy).activities).toHaveLength(0);
    expect(() => preschoolReviewProposal([preparation()], defaultPedagogyPolicy({ cycle: 'primary' }))).toThrow('POLICY_REQUIRED');
    expect(() => preschoolReviewProposal([preparation(), preparation()], policy)).toThrow('SNAPSHOT');
  });
  it('is deterministic and changes checksum for a new declaration', () => {
    const policy = defaultPedagogyPolicy({ catalogLevelId: 'fr-preschool-pre' }), value = preparation();
    const before = preschoolReviewProposal([value], policy);
    expect(preschoolReviewProposal([value], policy)).toEqual(before);
    value.teachingConfirmation!.id = 'new-declaration';
    expect(preschoolReviewProposal([value], policy).sourceChecksum).not.toBe(before.sourceChecksum);
  });
});
