import { describe, expect, it } from 'vitest';
import { classCoverageSummary } from '../../src/features/pedagogy/services/classCoverageSummary';
import type { CoverageRow } from '../../src/features/pedagogy/services/curriculumCoverage';

const row = (change: Partial<CoverageRow> = {}): CoverageRow => ({ classId: 'a', className: 'CE1', section: 'fr', subsystem: 'general', level: 'LEVEL_NOT_MAPPED', subject: 'MATIÈRES / DOMAINES À CONFIGURER', sourceFound: false, sourceAuthenticated: false, rightsKnown: false, contentExtracted: false, contentStructured: false, humanReviewRequired: true, publishedInStaging: false, adoptedByITALO: false, missingReason: '', candidateDocumentIds: [], ...change });
describe('class configuration summaries', () => {
  it('keeps missing configuration visible without claiming a subject', () => {
    expect(classCoverageSummary([row()])).toEqual([{ classId: 'a', name: 'CE1', subjects: 0, adopted: false, levelMapped: false }]);
  });
  it('deduplicates subjects without combining distinct classes', () => {
    const summaries = classCoverageSummary([row({ subject: 'Mathématiques' }), row({ subject: 'Mathématiques' }), row({ classId: 'b', subject: 'English', level: 'en-primary-1' })]);
    expect(summaries.map(item => item.subjects)).toEqual([1, 1]);
    expect(summaries[1].levelMapped).toBe(true);
    expect(summaries.every(item => !item.adopted)).toBe(true);
  });
  it('does not infer adoption from a source candidate', () => {
    expect(classCoverageSummary([row({ candidateDocumentIds: ['official-candidate'] })])[0].adopted).toBe(false);
    expect(classCoverageSummary([])).toEqual([]);
  });
});
