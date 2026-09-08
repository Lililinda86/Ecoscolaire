import { expect, it } from 'vitest';
import { curriculumProvenanceLabel, curriculumProvenanceLink } from '../../src/features/pedagogy/services/curriculumProvenance';
it('does not turn a source-type label into documentary authentication', () => {
  expect(curriculumProvenanceLabel('official')).toContain('déclarée');
  expect(curriculumProvenanceLabel('official')).toContain('à vérifier');
  expect(curriculumProvenanceLabel('mock')).toContain('non homologuée');
  expect(curriculumProvenanceLabel(undefined)).toBe('Provenance non renseignée');
});
it('only renders usable HTTPS provenance links, never embedded credentials or scripts', () => {
  expect(curriculumProvenanceLink('https://www.minesec.gov.cm/')).toBe('https://www.minesec.gov.cm/');
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.org/', 'http://example.org/', 'invalid', null]) expect(curriculumProvenanceLink(value)).toBeNull();
});
