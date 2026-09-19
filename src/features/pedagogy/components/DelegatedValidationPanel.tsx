import { useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../db/firebase';
import { useScopedResource } from '../hooks/useScopedResource';
export interface DelegatedDecision {
 id: string; schoolId: string; academicYearId: string; scope: string; classification: string;
 decision: string; reason: string; catalogLevelId?: string; classId?: string; officialSubject?: string;
 evidence?: { localSubjects?: Array<{ id: string; name: string }> };
 decisionOrigin: string; decisionAuthorizedBy: string; decisionRecordedBy: string;
 sourceVersion: string; mappingVersion: string; decisionBatchId: string; unresolvedCoverage?: string;
}
const empty: DelegatedDecision[] = [];
export function DelegatedValidationPanel({ schoolId, yearId }: { schoolId?: string; yearId?: string }) {
 const load=useCallback(async()=>{
  const r=await httpsCallable<unknown,{delegatedDecisions?:DelegatedDecision[]}>(functions,'reviewCurriculumSubjectMappings')({action:'preview',schoolId,academicYearId:yearId});
  if(!Array.isArray(r.data.delegatedDecisions))return empty;
  return r.data.delegatedDecisions.filter(d=>d.schoolId===schoolId&&d.academicYearId===yearId&&d.decisionOrigin==='OWNER_DELEGATED_VALIDATION');
 },[schoolId,yearId]);
 const resource=useScopedResource(schoolId&&yearId?JSON.stringify([schoolId,yearId]):null,empty,load,'Lecture des validations déléguées impossible.');
 if(!schoolId||!yearId)return null;
 const pedagogical=resource.data.filter(d=>!d.scope.includes('RESOURCE'));
 return <section className="pedagogy-card" aria-label="Validations déléguées">
  <h2>Validations déléguées</h2>
  {resource.loading&&<p role="status">Lecture des décisions enregistrées…</p>}
  {resource.error&&<p role="alert">{resource.error}</p>}
  {!resource.loading&&!resource.error&&<>
   <p>{pedagogical.length} décisions pédagogiques et réserves enregistrées · {resource.data.length-pedagogical.length} classifications de ressources.</p>
   <p>Autorisation du propriétaire, enregistrement par le workflow délégué. Les choix locaux ne constituent pas des obligations ministérielles. Une validation documentaire ne prouve ni l’ouverture ni l’enseignement d’une matière.</p>
   {!resource.data.length&&<p>Aucune validation déléguée supplémentaire enregistrée pour cette école et cette année.</p>}
   <details><summary>Consulter décisions, réserves et blocages</summary>
    {pedagogical.map(d=><article key={d.id}><h3>{d.catalogLevelId||'Source documentaire'} — {d.officialSubject||'Réserve documentaire'}</h3><p>{d.decision} · catégorie {d.classification}</p><p>{d.reason}</p>{d.unresolvedCoverage&&<p>Couverture réelle : {d.unresolvedCoverage}</p>}<details><summary>Traçabilité de cette décision</summary><p>Autorisation : {d.decisionAuthorizedBy}. Enregistrement : {d.decisionRecordedBy}. Provenance : {d.decisionOrigin}.</p><p style={{overflowWrap:'anywhere'}}>Lot : {d.decisionBatchId}<br/>Source : {d.sourceVersion}<br/>Mapping : {d.mappingVersion}</p></details></article>)}
   </details>
  </>}
 </section>;
}
