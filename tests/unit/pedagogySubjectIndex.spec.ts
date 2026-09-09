import { expect, it } from 'vitest';
import { minedubSubjectIndex, referenceForClass } from '../../src/features/pedagogy/resources/minedubSubjectIndex';
import { minedubDocuments } from '../../src/features/pedagogy/resources/minedubVerified';
it('provides ten documented primary subject headings and five preschool domains per reference', () => {
  expect(minedubSubjectIndex).toHaveLength(8);
  for (const item of minedubSubjectIndex) {
    expect(minedubDocuments.some(doc => doc.id === item.documentId)).toBe(true);
    expect(new Set(item.names).size).toBe(item.kind === 'domains' ? 5 : 10);
    expect(item.pdfPages.every(page => page > 0)).toBe(true);
  }
});
it('keeps section and level matching explicit and never labels a nominal match fully configured', () => {
  expect(referenceForClass(' CE1 ', 'francophone').documentId).toBe('minedub-fr-primary-2');
  expect(referenceForClass('Class 6', 'anglophone').documentId).toBe('minedub-en-primary-3');
  expect(referenceForClass('CE1', 'anglophone').documentId).toBeNull();
  expect(referenceForClass('CE1', 'francophone').status).toBe('PARTIAL');
});
it('does not invent preschool years, pre-nursery ministry curricula or secondary coverage', () => {
  expect(referenceForClass('Maternelle 3', 'francophone').status).toBe('PENDING_HUMAN_MAPPING');
  expect(referenceForClass('Pre-nursery', 'anglophone').documentId).toBeNull();
  expect(referenceForClass('6e', 'francophone').status).toBe('MISSING_OFFICIAL_SOURCE');
});
