/** Classification vocabulary, not an assertion that external documents are stocked. */
export const resourceTaxonomy = [
  { kind: 'official_exam', label: 'Examen officiel', requirement: 'Organisme, session, source primaire et authenticité vérifiés ; aucun sujet externe intégré actuellement.' },
  { kind: 'official_answer_key', label: 'Corrigé officiel', requirement: 'Authentification indépendante du corrigé et lien vers le sujet ; un corrigé interne ne reçoit jamais ce label.' },
  { kind: 'italo_assessment', label: 'Évaluation ITALO', requirement: 'Création interne et décision enseignante reçue ; pas une annale officielle.' },
  { kind: 'weekly_assessment', label: 'Évaluation du vendredi', requirement: 'Brouillon lié aux seules portions enseignées ; banque après visas de la version courante.' },
  { kind: 'mock_exam', label: 'Examen blanc', requirement: 'Simulation interne explicitement déclarée, jamais un sujet officiel par ressemblance.' },
  { kind: 'practice', label: 'Exercice d’entraînement', requirement: 'Ressource originale ou réutilisation autorisée ; aucune décision d’enseignement déduite.' },
  { kind: 'ceduc_resource', label: 'Ressource CEDUC', requirement: 'Complémentaire ; identité et droits PENDING_RIGHTS, aucun catalogue inventé.' },
  { kind: 'external_link', label: 'Lien externe', requirement: 'LINK_ONLY ; ni possession du document ni droit de redistribution implicite.' },
] as const;
