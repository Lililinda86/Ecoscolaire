import { useState } from 'react';
import { summarizeObjectiveEvidence, type ObservationScope } from '../services/observationEvidence';
const labels: Record<string, string> = { not_observed: 'Non observé', discovering: 'En découverte', developing: 'En cours d’acquisition', acquired: 'Acquis dans la situation observée' };
export function ObjectiveEvidenceSummary({ rows, scope }: { rows: Array<{ id: string; [key: string]: unknown }>; scope: ObservationScope }) {
  const [page, setPage] = useState(0);
  const groups = summarizeObjectiveEvidence(rows, scope);
  const pages = Math.max(1, Math.ceil(groups.length / 25)), current = Math.min(page, pages - 1);
  return <section aria-label="Synthèse des objectifs observés" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <h2>Objectifs observés — dernières situations déclarées</h2>
    <p>Regroupement par matière et texte exact de l’objectif, sans assimilation automatique à une compétence officielle. Les observations rectifiées sont exclues. Une date plus récente ne prouve pas un progrès.</p>
    {!groups.length && <p>Aucun objectif assorti d’une observation exploitable. Aucune maîtrise n’est déduite des notes.</p>}
    {groups.slice(current * 25, (current + 1) * 25).map(group => <article key={group.key}>
      <h3>{group.objective}</h3><p>{group.subjectId} · {group.latestDate} · {group.states.map(state => labels[state]).join(' / ')}</p>
      {group.conflicting && <p>États différents à la même date : vérifier les situations avec l’enseignant, sans choisir automatiquement un résultat.</p>}
      <small>{group.currentObservationCount} observation(s) non rectifiée(s) ; référence(s) de la dernière date : {group.latestObservationIds.join(', ')}.</small>
    </article>)}
    {pages > 1 && <div className="pedagogy-actions"><button disabled={current === 0} onClick={() => setPage(current - 1)}>Objectifs précédents</button><span>Page {current + 1}/{pages}</span><button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Objectifs suivants</button></div>}
  </section>;
}
