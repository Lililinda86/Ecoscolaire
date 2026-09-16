import { describe, expect, it } from 'vitest';
import { filterMaterials, materialCatalog, materialPreparationText, materialProvenance } from './materialCatalog';

describe('documentary material library', () => {
  it('deduplicates canonical documents and keeps the 40 local proposals distinct', () => {
    expect(materialCatalog).toHaveLength(134);
    expect(new Set(materialCatalog.map(d => d.id)).size).toBe(134);
    expect(filterMaterials({ source: 'MINEDUB' })).toHaveLength(8);
    expect(filterMaterials({ source: 'MINESEC' })).toHaveLength(79);
    expect(filterMaterials({ source: 'ITALO' })).toHaveLength(40);
    expect(filterMaterials({ source: 'GCE BOARD' })).toHaveLength(7);
    expect(materialCatalog.filter(d => d.sourceAliases!.length > 1).map(d => d.sourceAliases!.map(a => a.id))).toEqual([['minesec-199', 'minesec-17'], ['minesec-49', 'minesec-50']]);
    expect(materialCatalog.flatMap(d => d.themes)).not.toContain('Italien');
  });
  it('filters local level, language, domain, type, theme and text conjunctively', () => {
    const local = filterMaterials({ level: 'fr-preschool-pre', source: 'ITALO', language: 'fr' });
    expect(local).toHaveLength(5);
    const first = local[0];
    expect(filterMaterials({ level: 'fr-preschool-pre', source: 'ITALO', subject: first.subjects[0], type: first.type, theme: first.themes[0], search: first.title })).toEqual([first]);
    expect(filterMaterials({ level: 'fr-preschool-pre', language: 'en' })).toEqual([]);
  });
  it('never turns retrieval or a local proposal into adopted curriculum', () => {
    expect(materialCatalog.every(d => !['APPROVED', 'ADOPTED'].includes(d.applicability))).toBe(true);
    expect(filterMaterials({ source: 'MINESEC' }).every(d => d.applicability === 'NOT_ESTABLISHED')).toBe(true);
    expect(filterMaterials({ source: 'MINESEC', language: 'À vérifier' })).toHaveLength(75);
    const guides = materialCatalog.filter(d => d.preparationOutline);
    expect(guides).toHaveLength(4);
    expect(guides.every(d => d.levels.length === 2 && d.preparationOutline?.length === 15)).toBe(true);
    expect(filterMaterials({ source: 'ITALO' }).every(d => d.provenance === 'ITALO_INTERNAL' && d.url === null)).toBe(true);
    expect(materialCatalog.filter(d => d.url).every(d => d.rights === 'LINK_METADATA_ONLY' && /^[a-f0-9]{64}$/.test(d.sourceVersion))).toBe(true);
  });
  it('keeps the specimen distinct from past papers and authentic answer keys', () => {
    const specimen = filterMaterials({ type: 'Spécimen officiel' });
    expect(specimen).toHaveLength(1);
    expect(specimen[0].note).toContain('pas une annale');
    expect(specimen[0].levels).toEqual([]);
    expect(filterMaterials({ type: 'Corrigé officiel' })).toEqual([]);
  });
  it('exports explicit provenance and only original unfilled teacher outlines', () => {
    for (const d of materialCatalog) {
      const metadata = materialProvenance(d);
      expect(metadata.issuer).toBeTruthy();
      expect(metadata.publicationDate).toBeNull();
      expect(metadata.effectiveDate).toBeNull();
      expect(metadata.pedagogicalApproval).toBe('NOT_IMPLIED');
      if (d.preparationOutline) {
        expect(materialPreparationText(d)).toContain('ITALO_LOCAL');
        expect(materialPreparationText(d)).toContain(d.sourceVersion);
        expect(materialPreparationText(d)).toContain('________________________');
        expect(d.levels.every(l => /^(fr-secondary-(6e|5e)|en-secondary-form[12])$/.test(l))).toBe(true);
      } else expect(materialPreparationText(d)).toBeNull();
    }
  });
});
