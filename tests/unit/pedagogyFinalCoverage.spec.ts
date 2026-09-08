import { expect, it } from 'vitest';
import { configuredCurriculumCoverage } from '../../src/features/pedagogy/services/curriculumCoverage';
import { provenanceRegistry, provenanceBadge, authenticatedOfficialDocument } from '../../src/features/pedagogy/resources/provenanceRegistry';
import { pedagogicalReviewPackText } from '../../src/features/pedagogy/resources/pedagogicalReviewPack';
import { minedubDocuments, structuredReviewExcerpts } from '../../src/features/pedagogy/resources/minedubVerified';
import { resourceTaxonomy } from '../../src/features/pedagogy/resources/resourceTaxonomy';
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
    expect(record).toHaveProperty('checksumSha256');
    expect(record).toHaveProperty('rightsStatus');
    if (record.sourceType === 'catalogue') {
      expect(authenticatedOfficialDocument(record)).toBe(false);
      expect(provenanceBadge(record)).not.toMatch(/^OFFICIEL/);
    }
  }
  expect(provenanceRegistry.find(row => row.authority === 'MINESUP')?.applicability).toBe('NOT_APPLICABLE');
  expect(provenanceRegistry.find(row => row.authority === 'CEDUC')?.officialUrl).toBeNull();
});
it('creates five complete review examples without fabricating human approval', () => {
  const pack = pedagogicalReviewPackText();
  expect(pack.match(/### 11\. Human questions/g)).toHaveLength(5);
  for (const decision of ['APPROVE', 'REQUEST_CHANGE', 'NOT_APPLICABLE']) expect(pack.match(new RegExp('\\[ \\] ' + decision, 'g'))).toHaveLength(5);
  expect(pack).toContain('HUMAN APPROVAL NOT PERFORMED');
  expect(pack).toContain('MISSING / CHECK_FAILED');
  expect(pack).toContain('Ni /20 ni classement');
  expect(pack).toContain('3 × 2 = 6');
});
it('keeps authentication, rights, adoption and partial structuring separate', () => {
  expect(resourceTaxonomy.map(row => row.kind)).toEqual(['official_exam', 'official_answer_key', 'italo_assessment', 'weekly_assessment', 'mock_exam', 'practice', 'ceduc_resource', 'external_link']);
  expect(minedubDocuments).toHaveLength(10);
  const verified = provenanceRegistry.filter(authenticatedOfficialDocument);
  expect(verified).toHaveLength(10);
  expect(verified.every(row => row.edition === '2018' && row.effectiveDate === null && row.rightsStatus === 'UNKNOWN' && row.storagePolicy === 'LINK_ONLY')).toBe(true);
  expect(new Set(verified.map(row => row.checksumSha256)).size).toBe(10);
  expect(structuredReviewExcerpts).toHaveLength(4);
  for (const excerpt of structuredReviewExcerpts) {
    expect(verified.some(row => row.id === excerpt.documentId)).toBe(true);
    expect(excerpt.sourcePdfPage).toBeGreaterThan(0);
    expect(excerpt.officialLesson).toBeNull();
    expect(excerpt.recommendedHours).toBeNull();
    expect(excerpt.status).toBe('PEDAGOGICAL_APPROVAL_REQUIRED');
  }
  const rows = configuredCurriculumCoverage('s', 'y', [{ id: 'cp', schoolId: 's', name: 'CP', type: 'francophone', subjects: ['math'] }], [], [], [], []);
  expect(rows[0].candidateDocumentIds).toEqual(['minedub-fr-primary-1']);
  expect(rows[0].contentStructured).toBe(false);
  expect(rows[0].adoptedByITALO).toBe(false);
});
