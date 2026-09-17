import { describe, expect, it } from 'vitest';
import { secondaryStructuredUnits, structuredModulesFor } from '../../src/features/pedagogy/resources/secondaryStructuredUnits';

describe('secondary documentary modules', () => {
  it('indexes 36 modules in nine exact first-cycle levels, not options or second cycle', () => {
    expect(secondaryStructuredUnits).toHaveLength(36);
    expect(new Set(secondaryStructuredUnits.map(u => u.id)).size).toBe(36);
    expect(new Set(secondaryStructuredUnits.map(u => u.catalogLevelId)).size).toBe(9);
    expect(secondaryStructuredUnits.filter(u => u.language === 'fr')).toHaveLength(16);
    expect(secondaryStructuredUnits.filter(u => u.language === 'en')).toHaveLength(20);
  });
  it('preserves the actual Form 4/5 distinction and documentary time totals', () => {
    expect(structuredModulesFor('minesec-62','en-secondary-form4').map(u => u.title)).toEqual(['Numbers and sets','Plane geometry','Algebraic reasoning']);
    expect(structuredModulesFor('minesec-62','en-secondary-form5').map(u => u.title)).toEqual(['Plane geometry','Solid shapes','Data and probability']);
    for (const level of new Set(secondaryStructuredUnits.map(u => u.catalogLevelId))) {
      const rows = secondaryStructuredUnits.filter(u => u.catalogLevelId === level);
      expect(rows.reduce((n,u) => n + u.documentaryHours, 0)).toBe(/form[345]$/.test(level) ? 104 : 100);
    }
  });
  it('keeps elementary statistics distinct from later probability and follows Form 5 source ordering', () => {
    expect(structuredModulesFor('minesec-8', 'en-secondary-form1')[3].title).toBe('Elementary statistics');
    expect(structuredModulesFor('minesec-62', 'en-secondary-form5').map(u => u.competencySourcePage)).toEqual([67, 75, 71]);
  });
  it('pins source hashes and scopes competency summaries without inventing activities or adoption', () => {
    const hashes: Record<string,string> = {
      'minesec-35':'1217f04a544a884779c1067037c89bfe57e0b8dbcef06264411d8a35072eedad',
      'minesec-8':'ea6a51e29b09f6fcf8284209b60cf4e850cfb8068fa6f21b7fcfaaa8263ce123',
      'minesec-52':'05aba9a71ff5165998855a2558ceea1749c0d46ef7b0a71d238c37d851e01a9c',
      'minesec-62':'bb223c3a4ca837ba132bc8b766d2c76130c05005be061f6dbcc893dbf56e7676',
    };
    for (const unit of secondaryStructuredUnits) {
      expect(unit.sourceVersion).toBe(hashes[unit.sourceDocumentId]);
      expect(unit.sourcePage).toBeGreaterThan(0);
      expect(unit.competency.length).toBeGreaterThan(15);
      expect(unit.competencySourcePage).toBeGreaterThan(unit.sourcePage);
      expect(unit.competencyScope).toBe('MODULE_OVERVIEW');
      expect([unit.activity,unit.assessment]).toEqual([null,null]);
      expect(unit.status).toBe('DOCUMENTARY_MODULE_REVIEW_REQUIRED');
      expect(unit.rights).toBe('LINK_METADATA_ONLY');
      expect(unit).not.toHaveProperty('teacherAssignment');
      expect(unit).not.toHaveProperty('coefficient');
    }
  });
});
