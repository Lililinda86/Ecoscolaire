export type AnnualReadinessStatus='COMPLETE'|'ITALO_VALIDATED'|'PARTIAL_BLOCKING'|'PENDING_SOURCE'|'NOT_APPLICABLE';
export interface AnnualPlanningScope {catalogLevelId:string;subjectName:string;coverageStatus:AnnualReadinessStatus;structuredContent?:string[];validatedFor?:{schoolId:string;academicYearId:string}}
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
