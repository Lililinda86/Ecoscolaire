import { describe, expect, it } from 'vitest';
import { matchOfficialSubjects, primaryDocumentByLevel, proposeDocumentaryProgression, type MappingSubject } from '../../src/features/pedagogy/services/subjectMapping';
import { additionalVerifiedUnits } from '../../src/features/pedagogy/resources/additionalVerifiedUnits';
const subject = (id: string, name: string, extra: Partial<MappingSubject> = {}): MappingSubject => ({ id, name, schoolId: 'school', section: 'francophone', cycles: ['primary'], isActive: true, ...extra });
describe('documentary subject matching', () => {
  it('adds twelve column-specific source excerpts without invented hours', () => {
    expect(additionalVerifiedUnits).toHaveLength(12);
    expect(new Set(additionalVerifiedUnits.map(u => u.level)).size).toBe(12);
    for (const unit of additionalVerifiedUnits) { expect(unit.sourcePdfPage).toBeGreaterThan(0); expect(unit.recommendedHours).toBeNull(); expect(unit.status).toBe('PEDAGOGICAL_APPROVAL_REQUIRED'); }
  });
  it('proposes only safe units against open weeks of the correct tenant/year', () => {
    const mappings = matchOfficialSubjects(['Mathématiques', 'Sciences humaines et sociales'], [subject('math', 'Mathématiques'), subject('h', 'Histoire')], 'school', 'francophone');
    const units = ['Mathématiques', 'Sciences humaines et sociales'].map((officialSubject, i) => ({ id: 'u' + i, officialSubject, catalogLevelId: 'fr-primary-cp', objectiveParaphrase: 'Synthetic objective', sourcePdfPage: 5, documentId: 'source' }));
    const weeks = [{ id: 'foreign', schoolId: 'other', academicYearId: 'year', weekStartDate: '2026-08-03', status: 'open' }, { id: 'open', schoolId: 'school', academicYearId: 'year', weekStartDate: '2026-09-07', status: 'open' }];
    const proposal = proposeDocumentaryProgression('school', 'year', 'fr-primary-cp', mappings, units, weeks);
    expect(proposal).toHaveLength(1); expect(proposal[0].teachingWeekId).toBe('open'); expect(proposal[0].status).toBe('proposed');
    expect(proposeDocumentaryProgression('school', 'year', 'fr-primary-cp', mappings, units, [])[0].calendarStatus).toBe('CALENDAR_REQUIRED');
    expect(JSON.stringify(proposal)).not.toMatch(/weeklyHours|coefficient|teacher_validated/);
  });
  it('maps exactly the twelve primary levels to their six source volumes', () => {
    expect(Object.keys(primaryDocumentByLevel)).toHaveLength(12);
    for (const [levels, source] of [ [['sil', 'cp'], '1'], [['ce1', 'ce2'], '2'], [['cm1', 'cm2'], '3']] as const) for (const level of levels) expect(primaryDocumentByLevel['fr-primary-' + level]).toBe('minedub-fr-primary-' + source);
    for (let n = 1; n <= 6; n++) expect(primaryDocumentByLevel['en-primary-' + n]).toBe('minedub-en-primary-' + Math.ceil(n / 2));
    expect(primaryDocumentByLevel['fr-preschool-ps']).toBeUndefined();
  });
  it('distinguishes exact and explicitly safe aliases without an adoption', () => {
    const rows = matchOfficialSubjects(['Mathématiques', 'English language'], [subject('m', 'Mathématiques'), subject('e', 'Anglais')], 'school', 'francophone');
    expect(rows.map(r => r.status)).toEqual(['EXACT', 'SAFE_ALIAS']);
    expect(rows.every(r => r.action === 'REUSE_EXISTING')).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/approved|adopted|coefficient|weeklyHours/);
  });
  it('does not force broader disciplines or partial local coverage', () => {
    const rows = matchOfficialSubjects(['Sciences humaines et sociales', 'Éducation artistique', 'Français et littérature'], [subject('h', 'Histoire'), subject('a', 'Arts et culture'), subject('f', 'Français')], 'school', 'francophone');
    expect(rows.every(r => r.status === 'AMBIGUOUS' && r.localMatch === null)).toBe(true);
  });
  it('never treats documentary catalog entries as local teaching configuration', () => {
    const [row] = matchOfficialSubjects(['Développement personnel'], [subject('reference', 'Développement personnel', { localConfigurationStatus: 'CATALOG_REFERENCE_ONLY' })], 'school', 'francophone');
    expect(row.status).toBe('MISSING_LOCAL_SUBJECT'); expect(row.action).toBe('NEEDS_HUMAN_MAPPING'); expect(row.referenceCandidates).toHaveLength(1);
  });
  it('rejects duplicates instead of choosing the first match', () => {
    const [row] = matchOfficialSubjects(['English language'], [subject('a', 'English language'), subject('b', 'Anglais')], 'school', 'francophone');
    expect(row.status).toBe('AMBIGUOUS'); expect(row.localMatch).toBeNull();
  });
  it('scopes matches by tenant, section, cycle and active status', () => {
    const catalog = [subject('foreign', 'Mathématiques', { schoolId: 'other' }), subject('nursery', 'Mathématiques', { cycles: ['nursery'] }), subject('en', 'Mathématiques', { section: 'anglophone' }), subject('inactive', 'Mathématiques', { isActive: false })];
    expect(matchOfficialSubjects(['Mathématiques'], catalog, 'school', 'francophone')[0].status).toBe('MISSING_LOCAL_SUBJECT');
  });
  it('is deterministic and blocks a many-to-one mapping', () => {
    const catalog = [subject('math', 'Mathématiques')];
    const names = ['Mathématiques', 'Initiation aux mathématiques'];
    const rows = matchOfficialSubjects(names, catalog, 'school', 'francophone');
    expect(rows.every(r => r.status === 'AMBIGUOUS')).toBe(true);
    expect(matchOfficialSubjects(names, catalog, 'school', 'francophone')).toEqual(rows);
  });
});
