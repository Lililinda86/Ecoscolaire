import { useCallback } from 'react';
import { useScopedResource } from '../hooks/useScopedResource';
import { loadCurriculumReviewDecisions, type CurriculumReviewDecision } from '../services/curriculumUnits';
const empty: CurriculumReviewDecision[] = [];
export function CurriculumReviewHistory({ schoolId, yearId, levelId }: { schoolId: string; yearId: string; levelId: string }) {
  const load = useCallback(() => loadCurriculumReviewDecisions(schoolId, yearId, levelId), [schoolId, yearId, levelId]);
  const resource = useScopedResource(JSON.stringify([schoolId, yearId, levelId]), empty, load, 'Journal indisponible.');
  return <section><h3>Corrections et non-applicabilités reçues</h3>
    {resource.loading && <p>Chargement du journal…</p>}{resource.error && <p role="alert">{resource.error}</p>}
    {!resource.loading && !resource.error && !resource.data.length && <p>Aucune décision non approbatrice enregistrée pour ce niveau.</p>}
    {resource.data.map(item => <details key={item.id}><summary>{item.reviewOutcome === 'request_correction' ? 'Correction demandée' : 'Non applicable'} — {item.effectiveDate}</summary><p>Auteur déclaré : {item.declaredBy} · version {item.programVersion}</p><p>{item.reference}</p><p>Aucune adoption créée ou modifiée par cette décision.</p></details>)}
  </section>;
}
