import { structuredModulesFor } from '../resources/secondaryStructuredUnits';

export function DocumentaryModules({ documentId, level }: { documentId: string; level?: string }) {
  const units = structuredModulesFor(documentId, level);
  if (!units.length) return null;
  return <section aria-label="Modules documentaires structurés">
    <h3>Modules du programme — repères pour préparer</h3>
    <p>Tableau documentaire résumé, pas une progression adoptée. Les objectifs détaillés, activités et évaluations restent à préparer. Aucune matière enseignée ni affectation n’est déduite.</p>
    {units.map(unit => <details key={unit.id}>
      <summary>{unit.level} · {unit.title}</summary>
      <p>{unit.objective}</p>
      <p>Compétence détaillée, activité et évaluation : non extraites de ce tableau.</p>
      <details><summary>Détails documentaires</summary>
        <p>{unit.sourceLocator} — PDF p. {unit.sourcePage}. Durée mentionnée dans le document : {unit.documentaryHours} h ; aucun horaire ITALO créé.</p>
        <p>Applicabilité actuelle à confirmer. {unit.status}</p>
        <p style={{ overflowWrap: 'anywhere' }}>{unit.sourceDocumentId} · {unit.sourceVersion}</p>
        <a href={unit.sourceUrl} target="_blank" rel="noopener noreferrer">Consulter la source du module</a>
      </details>
    </details>)}
  </section>;
}
