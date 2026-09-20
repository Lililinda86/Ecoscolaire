import { annualVerifiedUnits } from '../resources/annualVerifiedUnits';
import type { actualAnnualReadiness } from '../services/annualReadiness';
import { useMemo, useState } from 'react';
import { annualCoverageScopes, annualGapUnits, summarizeAnnualCoverage } from '../resources/annualCoverage';
import { earlyYearsAnnualPlans } from '../resources/earlyYearsAnnualPlans';
const levelLabel=(id:string)=>id.replace('fr-primary-','Primaire FR · ').replace('en-primary-','Primary · ').replace('fr-secondary-','Secondaire FR · ').replace('en-secondary-','Secondary · ').replace('fr-preschool-','Préscolaire · ').replace('en-nursery-','Nursery · ');
const scopeLabel=(s:string)=>s.startsWith('LEVEL_')?'Objectifs communs aux deux classes du niveau ; tableaux propres à chaque classe à compléter.':s==='LOCATED_MODULE_NOT_COMPLETE_LESSON'?'Module localisé ; leçons détaillées à compléter.':s==='SHARED_INTRODUCTION_NOT_CLASS_DETAIL'?'Introduction commune ; détail par classe à compléter.':s;
export function AnnualCoveragePanel({levelIds,actual}:{levelIds:string[];actual?:ReturnType<typeof actualAnnualReadiness>}) {
 const [selected,setSelected]=useState('');
 const rows=useMemo(()=>annualCoverageScopes.filter(r=>levelIds.includes(r.catalogLevelId)&&(!selected||r.catalogLevelId===selected)),[levelIds,selected]);
 const totals=summarizeAnnualCoverage(rows);
 const labels={COMPLETE:'Complet',ITALO_VALIDATED:'Programme local validé',PARTIAL_BLOCKING:'Partiel bloquant',PENDING_SOURCE:'Source indispensable en attente',NOT_APPLICABLE:'Non applicable'};
 return <section className="pedagogy-card" aria-label="Couverture annuelle documentaire">
  <h2>Couverture annuelle documentaire</h2>
  <p>Catalogue de référence pour les niveaux de l’établissement. Les options documentées ne sont pas nécessairement enseignées. Une synthèse ou un index ne constitue pas un programme annuel complet.</p>
  {actual&&<div aria-label="Couverture pédagogique réelle"><p>{actual.activeClasses} classes actives · {actual.applicableScopes} couples publiés · {actual.readyScopes} prêts pour une planification annuelle ({actual.knownScopeReadyPercentage===null?'non calculable':actual.knownScopeReadyPercentage.toFixed(2)+' %'} sur le périmètre publié).</p><p>{actual.unconfiguredClassIds.length} classes sans liste publiée exploitable. {actual.wholeSchoolDenominatorEstablished?'Dénominateur configuré établi.':'Couverture globale de l’établissement non certifiable : dénominateur incomplet.'}</p><details><summary>Matières publiées et éléments bloquants</summary>{actual.rows.map(r=><p key={r.classId+r.subjectId}>{levelLabel(r.catalogLevelId)} · {r.subjectName} · {labels[r.coverageStatus]} : {r.missingReason}</p>)}</details></div>}
  <label>Filtrer la couverture par niveau <select aria-label="Niveau de couverture annuelle" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Tous les niveaux affichés</option>{[...new Set(levelIds)].map(l=><option key={l} value={l}>{levelLabel(l)}</option>)}</select></label>
  <p>{totals.expectedDocumentaryScopes} couples documentaires · {totals.COMPLETE} complets · {totals.ITALO_VALIDATED} validés ITALO · {totals.PARTIAL_BLOCKING} partiels bloquants · {totals.PENDING_SOURCE} sources en attente · {totals.NOT_APPLICABLE} non applicables.</p>
  <p>Couverture documentaire : {totals.documentaryUsable}/{totals.expectedDocumentaryScopes} ({totals.documentaryCoveragePercentage.toFixed(2)} %). Ce chiffre mesure la présence de sources exploitables, pas la préparation à la Production.</p>
  <p>PLANIFICATION PARTIELLE / VALIDATION REQUISE pour tout couple bloquant ou en attente de source.</p>
  <p>Les séries et combinaisons inconnues empêchent de certifier le total des matières réellement attendues. Les périodes restent « Année » : aucun calendrier ministériel hebdomadaire n’est déduit.</p>
  {!rows.length&&<p>Aucun périmètre documentaire connu pour les niveaux affichés.</p>}
  <details><summary>Consulter la matrice et les contenus localisés</summary>
  {rows.map(row=><article key={row.id} className="pedagogy-list-row"><div>
   <h3>{levelLabel(row.catalogLevelId)} · {row.subjectName}</h3><p>Année · {labels[row.coverageStatus]}</p><p>{row.missingReason}</p>
   <p>{row.units} synthèses/unités · {row.moduleIndexCount} modules indexés sans objectifs extraits · {row.lessonsActivities} exemples d’activités · {row.objectives} objectifs · {row.competencies} compétences.</p>
   {row.officialSource.map(s=><p key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer">Source {s.id}</a></p>)}
   <details><summary>Objectifs, thèmes et pages</summary>{annualGapUnits.filter(u=>row.structuredContent.includes(u.id)).map(u=><div key={u.id}><h4>{u.title}</h4><p>{u.themes.join(' · ')}</p><p>Objectif : {u.objective||'Non encore extrait'}</p><p>Compétence : {u.competency||'Non encore extraite'}</p>{u.activity&&<p>Exemple d’activité : {u.activity}</p>}<p>{u.sourceLocator}</p><p>Portée : {scopeLabel(u.sourceScope)}</p></div>)}
   {annualVerifiedUnits.filter(u=>row.structuredContent.includes(u.id)).map(u=><div key={u.id}><h4>{u.title}</h4><p>{u.theme} · {u.objective}</p><p>Compétence : {u.competency}</p><p>Activité : {u.activity}</p><p>{u.methodology}</p><p>Évaluation : {u.assessment}</p><p>{u.sourceLocator}</p></div>)}
   {earlyYearsAnnualPlans.filter(p=>row.structuredContent.includes(p.id)).map(p=><div key={p.id}><h4>Progression Ecoscolaire proposée — programme local ITALO</h4>{p.phases.map(phase=><p key={phase.label}><strong>{phase.label}</strong> : {phase.action}</p>)}<p>Validation locale déléguée du contenu : {p.validation.version}. Ne vaut pas adoption de classe.</p>{p.annualExtensions.map(e=><div key={e.sequence}><h5>{e.title}</h5><p>{e.activity}</p><p>{e.objective}</p><p>{e.competency}</p><p>{e.adaptation}</p><p>{e.assessment}</p></div>)}<p>{p.adaptation}</p><p>{p.safety}</p></div>)}
   </details>
  </div></article>)}
  </details>
 </section>;
}
