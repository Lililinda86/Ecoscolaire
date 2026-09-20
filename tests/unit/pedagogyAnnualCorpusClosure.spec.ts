import { describe, expect, it } from 'vitest';
import { annualCoverageScopes, summarizeAnnualCoverage } from '../../src/features/pedagogy/resources/annualCoverage';
import { closureVerifiedUnits } from '../../src/features/pedagogy/resources/annualClosurePrimary';
import { closurePartialUnits } from '../../src/features/pedagogy/resources/annualClosurePartial';
import { actualAnnualReadiness } from '../../src/features/pedagogy/services/annualReadiness';
import { annualPlanningBlockers } from '../../functions/src/pedagogy/annualReadiness';
import { annualReadinessRegistry } from '../../functions/src/pedagogy/annualReadinessRegistry';

describe('annual corpus closure without inferred local teaching',()=>{
 it('covers all eight CP English themes in all four language strands',()=>{
  const units=closureVerifiedUnits.filter(u=>u.subjectName==='English language');
  expect(units).toHaveLength(32);
  for(const table of [9,10,11,12])expect(new Set(units.filter(u=>u.sourceLocator.includes(`tableau ${table},`)).map(u=>u.theme)).size).toBe(8);
  expect(units.every(u=>u.catalogLevelId==='fr-primary-cp'&&u.sourceVersion==='38f57980080bbfddb5fd5d4ca83b553ced3ed36ef9447eb333b9deea76b9fe81')).toBe(true);
 });
 it('does not silently harmonise the different English number ranges or import the SIL column',()=>{
  const oral=closureVerifiedUnits.find(u=>u.title==='Écouter et parler : voyage')!;
  const reading=closureVerifiedUnits.find(u=>u.title==='Lire : voyage')!;
  expect(oral.objective).toContain('21 à 40');expect(reading.objective).toContain('20 à 40');
  expect(closurePartialUnits.find(u=>u.catalogLevelId==='fr-primary-ce2'&&u.title==='Health')?.objective).toContain('350–400');
 });
 it('retains the source reserves when detailed CE1 and CE2 content is added',()=>{
  for(const level of ['fr-primary-ce1','fr-primary-ce2']){
   const row=annualCoverageScopes.find(r=>r.catalogLevelId===level&&r.subjectName==='English language')!;
   expect(row.structuredAnnual).toBe(true);expect(row.coverageStatus).toBe('PARTIAL_BLOCKING');expect(row.partialCause).toBe('CONTRADICTION');
   expect(annualPlanningBlockers(level,['English language'],annualReadinessRegistry,'s','y')).toEqual(['English language']);
  }
 });
 it('classifies every partial and distinguishes documentary presence from structured annual coverage',()=>{
  const partial=annualCoverageScopes.filter(r=>r.coverageStatus==='PARTIAL_BLOCKING');
  expect(partial.every(r=>r.partialCause&&r.missingReason)).toBe(true);
  const summary=summarizeAnnualCoverage(annualCoverageScopes);
  expect(summary.documentaryUsable).toBeGreaterThan(summary.structuredAnnual);
  expect(summary.structuredAnnual).toBeGreaterThan(summary.COMPLETE+summary.ITALO_VALIDATED);
 });
 it('recognises CP English only in the published tenant/year revision and does not promote Arts et culture',()=>{
  const classes=[{id:'c',schoolId:'s',catalogLevelId:'fr-primary-cp'}];
  const programs=[{id:'p',schoolId:'s',academicYearId:'y',classId:'c',status:'published',publishedRevisionId:'r'}];
  const subjects=['Anglais','Arts et culture'].map((name,i)=>({id:`row${i}`,schoolId:'s',academicYearId:'y',classId:'c',programId:'p',revisionId:'r',subjectId:`subject${i}`,subjectNameSnapshot:name}));
  const catalog=subjects.map(s=>({id:s.subjectId,schoolId:'s',name:s.subjectNameSnapshot,section:'francophone',cycles:['primary']}));
  const result=actualAnnualReadiness('s','y',classes,programs,subjects,catalog);
  expect(result.applicableScopes).toBe(2);expect(result.readyScopes).toBe(1);
  expect(result.rows.find(r=>r.subjectName==='Arts et culture')?.automaticPlanningEligible).toBe(false);
  expect(actualAnnualReadiness('other','y',classes,programs,subjects,catalog).readyScopes).toBe(0);
  expect(actualAnnualReadiness('s','old',classes,programs,subjects,catalog).readyScopes).toBe(0);
 });
 it('preserves unknown second-cycle options and excludes drafts from annual readiness',()=>{
  const rows=annualCoverageScopes.filter(r=>/lower-sixth|upper-sixth/.test(r.catalogLevelId));
  expect(rows.every(r=>!['COMPLETE','ITALO_VALIDATED'].includes(r.coverageStatus))).toBe(true);
  expect(rows.filter(r=>/Computer Science|Communication Technology/.test(r.subjectName)).every(r=>r.coverageStatus==='PENDING_SOURCE')).toBe(true);
 });
});
