import { expect, it } from 'vitest';
import { DEFAULT_SUBJECT_CATALOG } from '../../functions/src/academic/defaultSubjectCatalog';
import { minedubSubjectIndex } from '../../src/features/pedagogy/resources/minedubSubjectIndex';
import { documentaryRelationsFor, matchOfficialSubjects, primaryDocumentByLevel } from '../../src/features/pedagogy/services/subjectMapping';
const catalog = DEFAULT_SUBJECT_CATALOG.map(s => ({ ...s, id: s.internalCode, schoolId: 'synthetic', isActive: true }));
const rows = Object.entries(primaryDocumentByLevel).map(([level, document]) => ({ level, mappings: matchOfficialSubjects(minedubSubjectIndex.find(s => s.documentId === document)!.names, catalog, 'synthetic', level.startsWith('fr-') ? 'francophone' : 'anglophone') }));
it('preserves 42 exact, 34 scoped aliases, 44 human choices and no missing subjects', () => {
  const all = rows.flatMap(r => r.mappings);
  expect(all.filter(m => m.status === 'EXACT')).toHaveLength(42);
  expect(all.filter(m => m.status === 'SAFE_ALIAS')).toHaveLength(34);
  expect(all.filter(m => m.status === 'AMBIGUOUS')).toHaveLength(44);
  expect(all.filter(m => m.status === 'MISSING_LOCAL_SUBJECT')).toHaveLength(0);
});
it('documents components without equating them to whole domains or making local decisions', () => {
  const row = rows.find(r => r.level === 'fr-primary-ce1')!;
  const mapping = row.mappings.find(m => m.officialSubject === 'Sciences humaines et sociales')!;
  expect(documentaryRelationsFor(row.level, mapping).find(r => r.subjectName === 'Histoire')?.type).toBe('COMPONENT_OF_OFFICIAL_DOMAIN');
  expect(mapping.status).toBe('AMBIGUOUS'); expect(mapping.localMatch).toBeNull();
  expect(documentaryRelationsFor('fr-primary-sil', mapping).find(r => r.subjectName === 'Histoire')?.type).toBe('UNRESOLVED');
  expect(documentaryRelationsFor('fr-secondary-6e', mapping)).toEqual([]);
});
it('clarifies ten domain cards while retaining all forty-four local owner choices', () => {
  const cases = rows.flatMap(row => row.mappings.filter(m => m.status === 'AMBIGUOUS').map(mapping => documentaryRelationsFor(row.level, mapping)));
  expect(cases).toHaveLength(44);
  expect(cases.filter(relations => relations.some(r => r.type === 'COMPONENT_OF_OFFICIAL_DOMAIN'))).toHaveLength(10);
  expect(cases.every(relations => relations.every(r => r.pdfPages.length && r.evidenceVersion === 'primary-documentary-relations-v1'))).toBe(true);
});
