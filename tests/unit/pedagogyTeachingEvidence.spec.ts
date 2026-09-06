import { describe, expect, it } from 'vitest';
import { admissibleTeachingContent, parseTeachingDeclaration, reviewChecksum, validDate, type ReviewedPreparation, type TeachingState } from '../../functions/src/pedagogy/teachingEvidence';

const preparation = (): ReviewedPreparation => ({ status: 'validated', currentUploadId: 'immutable-upload', reviewData: { lessonTitle: 'Fractions', objective: 'Partager une unité', lessonSteps: 'Partager en deux parts égales. Comparer les fractions.' } });
const week = { weekStartDate: '2026-08-31', weekEndDate: '2026-09-04' };
const declaration = { status: 'taught', effectiveDate: '2026-09-02', excerpts: [], note: 'Déclaration reçue sur la fiche.' };
function confirmed(status: TeachingState = 'taught') {
  const item = preparation();
  item.teachingConfirmation = { ...parseTeachingDeclaration({ ...declaration, status, excerpts: ['Partager en deux parts égales.'] }, item, week, '2026-09-06'), id: 'confirmation-1', declaredByTeacherStaffId: 'teacher', recordedBy: 'secretary' };
  return item;
}
describe('Enseignements confirmés, distincts de la réception', () => {
  it('excludes old validated preparations without inventing a declaration', () => expect(admissibleTeachingContent(preparation()).exclusion).toBe('teaching_not_confirmed'));
  it.each(['unconfirmed', 'postponed', 'not_taught'] as const)('excludes %s', status => expect(admissibleTeachingContent(confirmed(status)).content).toBe(''));
  it('limits partial teaching to exact confirmed passages, excluding the general title/objective', () => {
    expect(admissibleTeachingContent(confirmed('partially_taught'))).toEqual({ content: 'Partager en deux parts égales.', exclusion: null });
    expect(admissibleTeachingContent(confirmed('partially_taught')).content).not.toContain('Comparer');
  });
  it('does not reuse unreviewed extraction content', () => {
    const item = { ...confirmed(), extractedData: { lessonSteps: 'NEVER INCLUDE' } };
    expect(admissibleTeachingContent(item).content).not.toContain('NEVER INCLUDE');
  });
  it('invalidates confirmation when reviewed content or immutable upload changes', () => {
    const item = confirmed(); item.reviewData = { ...item.reviewData, objective: 'Another objective' };
    expect(admissibleTeachingContent(item).exclusion).toBe('confirmation_refers_to_previous_review');
    const replaced = confirmed(); replaced.currentUploadId = 'different-upload';
    expect(admissibleTeachingContent(replaced).content).toBe('');
  });
  it('rejects arbitrary text not contained in the reviewed lesson', () => expect(() => parseTeachingDeclaration({ ...declaration, status: 'partially_taught', excerpts: ['Invented subject'] }, preparation(), week, '2026-09-06')).toThrow('EXCERPT_OUTSIDE_REVIEWED_CONTENT'));
  it('requires explicit portions for partial teaching', () => expect(() => parseTeachingDeclaration({ ...declaration, status: 'partially_taught' }, preparation(), week, '2026-09-06')).toThrow('TAUGHT_EXCERPTS_REQUIRED'));
  it('requires a received and reviewed preparation for taught status', () => expect(() => parseTeachingDeclaration(declaration, { ...preparation(), currentUploadId: undefined }, week, '2026-09-06')).toThrow('RECEIVED_REVIEWED_CONTENT_REQUIRED'));
  it.each(['2026-09-05', '2026-08-30', '2026-02-31', 'invalid'])('rejects incompatible date %s', effectiveDate => expect(() => parseTeachingDeclaration({ ...declaration, effectiveDate }, preparation(), week, '2026-09-06')).toThrow('TEACHING_DATE_OUTSIDE_WEEK_OR_IN_FUTURE'));
  it('rejects a future declaration', () => expect(() => parseTeachingDeclaration(declaration, preparation(), week, '2026-09-01')).toThrow('TEACHING_DATE_OUTSIDE_WEEK_OR_IN_FUTURE'));
  it('does not turn a postponement into a performed date', () => expect(parseTeachingDeclaration({ ...declaration, status: 'postponed' }, preparation(), week, '2026-09-06').effectiveDate).toBeNull());
  it('hashes only the reviewed content and upload identity, independent of object key ordering', () => expect(reviewChecksum(preparation())).toBe(reviewChecksum({ ...preparation(), reviewData: { ...preparation().reviewData } })));
  it('validates actual calendar dates', () => { expect(validDate('2028-02-29')).toBe(true); expect(validDate('2027-02-29')).toBe(false); });
});
