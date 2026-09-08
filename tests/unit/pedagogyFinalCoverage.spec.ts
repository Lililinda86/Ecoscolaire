import { expect, it } from 'vitest';
import { configuredCurriculumCoverage } from '../../src/features/pedagogy/services/curriculumCoverage';
import { provenanceRegistry, provenanceBadge, authenticatedOfficialDocument } from '../../src/features/pedagogy/resources/provenanceRegistry';
import { pedagogicalReviewPackText } from '../../src/features/pedagogy/resources/pedagogicalReviewPack';
it('does not drop preschool or unmapped active classes or claim coverage from a catalogue', () => {
  const rows = configuredCurriculumCoverage('s', 'y', [
    { id: 'pre', schoolId: 's', name: 'Pre', type: 'francophone', subjects: ['language'] },
    { id: 'unknown', schoolId: 's', name: 'Unmapped', type: 'anglophone' },
    { id: 'inactive', schoolId: 's', name: 'Inactive', type: 'anglophone', isActive: false },
    { id: 'other', schoolId: 'elsewhere', name: 'Other', type: 'anglophone' },
  ], [], [], [], []);
  expect(rows).toHaveLength(2);
  expect(rows[1].subject).toContain('À CONFIGURER');
  expect(rows.every(row => !row.sourceAuthenticated && !row.publishedInStaging && row.humanReviewRequired)).toBe(true);
});
it('records all provenance fields and cannot give official badges to catalogue links', () => {
  for (const record of provenanceRegistry) {
    expect(record).toHaveProperty('checksumSha256', null);
    expect(record).toHaveProperty('rightsStatus');
    expect(authenticatedOfficialDocument(record)).toBe(false);
    expect(provenanceBadge(record)).not.toMatch(/^OFFICIEL/);
  }
  expect(provenanceRegistry.find(row => row.authority === 'MINESUP')?.applicability).toBe('NOT_APPLICABLE');
  expect(provenanceRegistry.find(row => row.authority === 'CEDUC')?.officialUrl).toBeNull();
});
it('creates five complete review examples without fabricating human approval', () => {
  const pack = pedagogicalReviewPackText();
  expect(pack.match(/### Human decision form/g)).toHaveLength(5);
  expect(pack).toContain('HUMAN APPROVAL NOT PERFORMED');
  expect(pack).toContain('Official locator: MISSING');
  expect(pack).toContain('Ni /20 ni classement');
  expect(pack).toContain('3 × 2 = 6');
});
