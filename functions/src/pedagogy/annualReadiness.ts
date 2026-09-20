export type AnnualReadinessStatus='COMPLETE'|'ITALO_VALIDATED'|'PARTIAL_BLOCKING'|'PENDING_SOURCE'|'NOT_APPLICABLE';
export interface AnnualPlanningScope {catalogLevelId:string;subjectName:string;coverageStatus:AnnualReadinessStatus;structuredContent?:string[];reviewedUnits?:Array<{id:string;title:string;objective:string;sourceVersion:string}>;validatedFor?:{schoolId:string;academicYearId:string}}
/** Registry is generated from reviewed repository content, never request data.
 * Unknown, ambiguous or incomplete annual scope fails closed. This does not
 * confer teacher validation or eligibility for Friday assessments. */
export function annualPlanningBlockers(level:string,subjects:string[],registry:AnnualPlanningScope[],schoolId:string,academicYearId:string):string[]{
 return subjects.filter(subject=>{const rows=registry.filter(r=>r.catalogLevelId===level&&r.subjectName===subject);return rows.length!==1||!(rows[0].coverageStatus==='COMPLETE'||rows[0].coverageStatus==='ITALO_VALIDATED'&&rows[0].validatedFor?.schoolId===schoolId&&rows[0].validatedFor?.academicYearId===academicYearId);});
}

export function annualPlanningUnitIds(level:string,subject:string,registry:AnnualPlanningScope[]):string[]{
 const rows=registry.filter(r=>r.catalogLevelId===level&&r.subjectName===subject);
 return rows.length===1?rows[0].structuredContent||[]:[];
}

export function annualPlanningUnitMatches(level:string,subject:string,programId:string,unit:{id:string;title:unknown;objective:unknown;sourceVersion:unknown},registry:AnnualPlanningScope[]):boolean {
 const rows=registry.filter(r=>r.catalogLevelId===level&&r.subjectName===subject);
 return rows.length===1&&Boolean(rows[0].reviewedUnits?.some(r=>(unit.id===r.id||unit.id===programId+'__'+r.id)&&unit.title===r.title&&unit.objective===r.objective&&unit.sourceVersion===r.sourceVersion));
}
