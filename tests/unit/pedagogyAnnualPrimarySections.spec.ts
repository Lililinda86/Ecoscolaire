import { expect,it } from 'vitest';
import {annualPrimarySections,annualPrimarySourceCautions} from '../../src/features/pedagogy/resources/annualPrimarySections';
it('keeps all twelve class columns, explicit partial coverage and located methods',()=>{
 expect(annualPrimarySections).toHaveLength(76);
 expect(new Set(annualPrimarySections.map(u=>u.catalogLevelId)).size).toBe(12);
 expect(new Set(annualPrimarySections.map(u=>u.id)).size).toBe(76);
 for(const u of annualPrimarySections){expect(u.sourceVersion).toMatch(/^[a-f0-9]{64}$/);expect(u.sourcePage).toBeGreaterThan(40);expect(u.methodologyPage).toBeGreaterThan(40);expect(u.period).toBeNull();expect(u.officialLesson).toBeNull();expect(u.coverage).toBe('PARTIAL');}
});
it('excludes ambiguous complex-number rows and never republishes erroneous geometry as validated',()=>{
 expect(annualPrimarySections.filter(u=>u.catalogLevelId.includes('-cm')&&u.sequence===6)).toEqual([]);
 expect(JSON.stringify(annualPrimarySections)).not.toMatch(/4 D shapes|isosceles/i);
 expect(annualPrimarySourceCautions).toHaveLength(4);
 expect(annualPrimarySections.find(u=>u.catalogLevelId==='en-primary-3'&&u.domain==='Geometry and space')?.objective).toContain('30');
 expect(annualPrimarySections.find(u=>u.catalogLevelId==='en-primary-4'&&u.domain==='Geometry and space')?.objective).toContain('parallel');
});
