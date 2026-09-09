import { expect, it } from 'vitest';
import { authenticatedOfficialDocument, provenanceBadge, provenanceRegistry } from '../../src/features/pedagogy/resources/provenanceRegistry';

it('does not promote a portal or a third-party ministry logo into an official curriculum', () => {
  for (const id of ['minesec-vod', 'minesec-distance-form-one-maths-candidate']) {
    const record = provenanceRegistry.find(item => item.id === id)!;
    expect(record.status).toBe('LINK_ONLY');
    expect(record.storagePolicy).toBe('LINK_ONLY');
    expect(record.checksumSha256).toBeNull();
    expect(authenticatedOfficialDocument(record)).toBe(false);
    expect(provenanceBadge(record)).toContain('LIEN EXTERNE');
  }
});
