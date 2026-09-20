import type { AnnualScope, AnnualCoverageStatus } from '../resources/annualCoverage';
import { annualCoverageScopes } from '../resources/annualCoverage';
import { matchOfficialSubjects, documentaryRelationsFor, type MappingSubject } from '../../../../functions/src/pedagogy/subjectMappingEngine';
interface Classroom {id:string;schoolId?:string;catalogLevelId?:string;isActive?:boolean;section?:string;name?:string}
interface Program {id:string;schoolId:string;academicYearId:string;classId:string;status:string;publishedRevisionId?:string}
interface Subject {id:string;schoolId:string;academicYearId:string;classId:string;programId:string;revisionId:string;subjectId:string;subjectNameSnapshot:string;isActive?:boolean}
export interface ActualAnnualScope {
 classId:string;catalogLevelId:string;subjectId:string;subjectName:string;revisionId:string;
 coverageStatus:AnnualCoverageStatus;documentaryScopeIds:string[];documentaryUsable:boolean;
 automaticPlanningEligible:boolean;missingReason:string;
}
/** Published revision is evidence of configuration. A draft or an absent subject
 * never establishes either actual teaching or non-applicability. */
export function actualAnnualReadiness(schoolId:string,yearId:string,classes:Classroom[],programs:Program[],subjects:Subject[],catalog:MappingSubject[],corpus:AnnualScope[]=annualCoverageScopes) {
 const activeClasses=classes.filter(c=>c.schoolId===schoolId&&c.isActive!==false);
 const rows:ActualAnnualScope[]=[]; const unconfiguredClassIds:string[]=[]; const ambiguousClassIds:string[]=[];
 for(const c of activeClasses){
  const current=programs.filter(p=>p.schoolId===schoolId&&p.academicYearId===yearId&&p.classId===c.id&&p.status==='published'&&p.publishedRevisionId);
  if(current.length!==1){unconfiguredClassIds.push(c.id);if(current.length>1)ambiguousClassIds.push(c.id);continue;}
  const p=current[0];const published=subjects.filter(s=>s.schoolId===schoolId&&s.academicYearId===yearId&&s.classId===c.id&&s.programId===p.id&&s.revisionId===p.publishedRevisionId&&s.isActive!==false);
  if(!published.length)unconfiguredClassIds.push(c.id);
  const level=c.catalogLevelId||'';const candidates=corpus.filter(r=>r.catalogLevelId===level);
  const cycle=level.includes('-primary-')?'primary':level.includes('-secondary-')?'secondary':'nursery';
  const mappings=matchOfficialSubjects(candidates.map(r=>r.subjectName),catalog,schoolId,level.startsWith('en-')?'anglophone':'francophone',cycle);
  const duplicates=new Set(published.filter((s,i)=>published.findIndex(t=>t.subjectId===s.subjectId)!==i).map(s=>s.subjectId));
  for(const s of [...new Map(published.map(s=>[s.subjectId,s])).values()]){
   const links=mappings.filter(m=>m.candidates.some(t=>t.id===s.subjectId));
   const related=candidates.filter(r=>links.some(m=>m.officialSubject===r.subjectName));
   const safe=links.length===1&&(links[0].localMatch?.id===s.subjectId);
   const component=links.some(m=>documentaryRelationsFor(level,m).some(r=>r.subjectId===s.subjectId&&r.type==='COMPONENT_OF_OFFICIAL_DOMAIN'));
   const ready=safe&&!duplicates.has(s.subjectId)&&related.length===1&&(related[0].coverageStatus==='COMPLETE'||related[0].coverageStatus==='ITALO_VALIDATED'&&related[0].validatedFor?.schoolId===schoolId&&related[0].validatedFor?.academicYearId===yearId);
   const status:AnnualCoverageStatus=ready?related[0].coverageStatus:related.some(r=>r.documentaryUsable)?'PARTIAL_BLOCKING':'PENDING_SOURCE';
   rows.push({classId:c.id,catalogLevelId:level,subjectId:s.subjectId,subjectName:s.subjectNameSnapshot,revisionId:s.revisionId,coverageStatus:status,documentaryScopeIds:related.map(r=>r.id),documentaryUsable:(safe||component)&&related.some(r=>r.documentaryUsable),automaticPlanningEligible:ready,missingReason:ready?'':duplicates.has(s.subjectId)?'Matière dupliquée dans la révision publiée : contrôler la configuration.':!links.length?'Aucune correspondance documentaire établie pour cette matière publiée.':!safe?'Composante ou rapprochement documentaire : le périmètre local ne constitue pas une équivalence annuelle.':related.map(r=>r.missingReason).join(' ')});
  }
 }
 const ready=rows.filter(r=>r.automaticPlanningEligible).length;
 return {schoolId,academicYearId:yearId,activeClasses:activeClasses.length,rows,unconfiguredClassIds,ambiguousClassIds,applicableScopes:rows.length,readyScopes:ready,documentaryUsableScopes:rows.filter(r=>r.documentaryUsable).length,knownScopeReadyPercentage:rows.length?100*ready/rows.length:null,wholeSchoolDenominatorEstablished:activeClasses.length>0&&unconfiguredClassIds.length===0&&ambiguousClassIds.length===0,notApplicable:0};
}
