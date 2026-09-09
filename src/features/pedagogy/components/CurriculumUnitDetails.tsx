import { useCallback } from 'react';
import { useScopedResource } from '../hooks/useScopedResource';
import { loadPublishedCurriculumUnits, type CurriculumUnitDetail } from '../services/curriculumUnits';
import { curriculumProvenanceLink } from '../services/curriculumProvenance';

const empty: CurriculumUnitDetail[] = [];
export function CurriculumUnitDetails({ schoolId, programId, levelId }: { schoolId: string; programId: string; levelId: string }) {
  const scope = schoolId && programId && levelId ? JSON.stringify([schoolId, programId, levelId]) : null;
  const load = useCallback(() => loadPublishedCurriculumUnits(programId, levelId), [programId, levelId]);
  const resource = useScopedResource(scope, empty, load, 'Lecture du programme impossible.');
  if (!scope) return null;
  return <section aria-label="Contenu du niveau"><h3>Contenu publié pour ce niveau</h3>
    <p>Cette consultation n’adopte pas le programme. La publication ne certifie ni sa source ni une validation pédagogique.</p>
    {resource.loading && <p role="status">Chargement du contenu…</p>}
    {resource.error && <p role="alert">{resource.error}</p>}
    {!resource.loading && !resource.error && !resource.data.length && <p>Aucune unité publiée pour ce programme et ce niveau. Ne pas adopter par simple ressemblance de nom.</p>}
    {resource.data.map(unit => <details key={unit.id}><summary>{unit.subjectName || unit.subjectId} — {unit.title}</summary>
      <p>Domaine : {unit.domain || 'non renseigné'}. Thème : {unit.theme || 'non renseigné'}.</p>
      <p>Objectif : {unit.objective || 'non renseigné'}</p><p>Compétence : {unit.competency || 'non renseignée'}</p>
      <p>Volume indicatif sourcé : {Number.isFinite(unit.indicativeHours) && (unit.indicativeHours || 0) > 0 && unit.sourceLocator && curriculumProvenanceLink(unit.sourceUrl) ? `${unit.indicativeHours} h (déclaré, à vérifier)` : 'non établi'}.</p>
      <p>Localisation dans la source : {unit.sourceLocator || 'non renseignée'}</p>
      {curriculumProvenanceLink(unit.sourceUrl) && <a href={curriculumProvenanceLink(unit.sourceUrl)!} target="_blank" rel="noopener noreferrer">Source déclarée de cette unité</a>}
      <p>Période / semaine : à proposer dans Planification, pas déduite automatiquement du programme.</p>
    </details>)}
  </section>;
}
