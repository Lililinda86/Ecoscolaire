import { describe, expect, it } from 'vitest';
import { filterMaterials, materialCatalog } from './materialCatalog';

describe('documentary material library', () => {
  it('deduplicates canonical documents and keeps the 40 local proposals distinct', () => {
    expect(materialCatalog).toHaveLength(132);
    expect(new Set(materialCatalog.map(d => d.id)).size).toBe(132);
    expect(filterMaterials({ source: 'MINEDUB' })).toHaveLength(8);
    expect(filterMaterials({ source: 'MINESEC' })).toHaveLength(81);
    expect(filterMaterials({ source: 'ITALO' })).toHaveLength(40);
    expect(filterMaterials({ source: 'GCE BOARD' })).toHaveLength(3);
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
    expect(filterMaterials({ source: 'MINESEC' }).every(d => d.applicability === 'NOT_ESTABLISHED' && d.language === 'À vérifier')).toBe(true);
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
});
