import { useState } from 'react';
import { syntheticReviewCases } from '../resources/pedagogicalReviewPack';
/** Isolated in-memory examples: no Firestore, Storage, Auth or provider calls. */
export function SyntheticReviewLab() {
  const [selected, setSelected] = useState('');
  const [step, setStep] = useState(0);
  const example = syntheticReviewCases.find(item => item.template.id === selected);
  const stages = example ? [
    ['Programme', 'Exemple interne non homologué. Correspondance au curriculum et approbation humaine non enregistrées.'],
    ['Planification', 'Séance synthétique proposée, sans horaire ministériel imposé : ' + example.template.title],
    ['Modèle de préparation', example.template.objective + ' Matériel : ' + example.template.materials],
    ['Préparation reçue — simulation', example.template.steps.join(' ')],
    ['Enseignement confirmé — simulation', 'Scénario fictif : seule l’activité décrite a été enseignée. Ce clic ne consigne aucune déclaration d’un enseignant réel.'],
    ['Évaluation / bilan — simulation', example.assessment],
    ['Résultat / observation — simulation', example.correction + ' ' + example.template.observation],
    ['Compétence / difficulté — simulation', 'Une tentative fictive ne suffit pas à conclure à une maîtrise globale. Objectif examiné : ' + example.template.objective],
    ['Remédiation — simulation', example.remediation],
  ] : [];
  return <section className="pedagogy-card" aria-label="Laboratoire synthétique de revue"><h2>Cinq parcours de revue synthétiques</h2>
    <p><strong>SIMULATION ISOLÉE — aucune donnée réelle.</strong> Ces exemples en mémoire expliquent le parcours ; ils ne constituent pas une recette des écritures backend, un résultat élève ou une validation enseignante. Aucun appel IA.</p>
    <label>Parcours synthétique<select value={selected} onChange={event => { setSelected(event.target.value); setStep(0); }}><option value="">Choisir…</option>{syntheticReviewCases.map(item => <option key={item.template.id} value={item.template.id}>{item.template.cycle} · {item.template.language.toUpperCase()} — {item.template.title}</option>)}</select></label>
    {example && <><p>Étape {step + 1} / {stages.length}</p><h3>{stages[step][0]}</h3><p>{stages[step][1]}</p>
      <button type="button" disabled={step === 0} onClick={() => setStep(value => value - 1)}>Étape précédente</button>
      <button type="button" disabled={step === stages.length - 1} onClick={() => setStep(value => value + 1)}>Étape suivante (simulation)</button>
      <button type="button" onClick={() => { setStep(0); setSelected(''); }}>Réinitialiser la simulation</button>
    </>}
  </section>;
}
