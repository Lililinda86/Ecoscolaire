export type ResourceCycle = 'pre_nursery' | 'nursery' | 'primary' | 'secondary';
export interface OriginalTemplate {
  id: string; language: 'fr' | 'en'; cycle: ResourceCycle; title: string;
  objective: string; materials: string; steps: string[]; differentiation: string;
  observation: string; safety: string;
  version: '1.0'; sourceKind: 'original_assistant_draft'; reviewStatus: 'pending';
  officialCurriculumId: null;
}

type Draft = Omit<OriginalTemplate, 'version' | 'sourceKind' | 'reviewStatus' | 'officialCurriculumId'>;
const drafts: Draft[] = [
  { id: 'original-pre-fr-v1', language: 'fr', cycle: 'pre_nursery', title: 'Explorer et nommer des objets familiers',
    objective: 'Proposer une situation de manipulation et de communication, à adapter par l’enseignant aux besoins de chaque enfant.',
    materials: 'Deux ou trois grands objets familiers, lavables et sans pièces détachables ; un panier.',
    steps: ['L’adulte présente un objet, le nomme et laisse un temps d’exploration.', 'Inviter l’enfant à choisir ou montrer un objet, sans exiger de réponse verbale.', 'Décrire ensemble une action simple : prendre, poser, donner. Arrêter avant la fatigue.'],
    differentiation: 'Accepter geste, regard, pointage ou parole. Réduire le nombre d’objets ; proposer une aide motrice adaptée.',
    observation: 'Noter l’action réellement observée, le contexte et l’aide apportée. Une absence de réponse n’est pas une incapacité acquise.',
    safety: 'Surveillance adulte continue. Exclure petits objets, piles, aimants, éléments coupants et toute pièce pouvant être avalée.' },
  { id: 'original-pre-en-v1', language: 'en', cycle: 'pre_nursery', title: 'Explore and name familiar objects',
    objective: 'Offer a hands-on communication activity for the teacher to adapt to each child’s needs.',
    materials: 'Two or three large, washable familiar objects without detachable parts; a basket.',
    steps: ['The adult presents and names one object, allowing time to explore.', 'Invite the child to choose or point to an object; speech is not required.', 'Describe a simple action together: take, put down, give. Stop before the child becomes tired.'],
    differentiation: 'Accept gesture, gaze, pointing or speech. Reduce the number of objects and adapt physical support.',
    observation: 'Record the action actually observed, its context and the help provided. No response does not establish inability.',
    safety: 'Continuous adult supervision. Exclude small objects, batteries, magnets, sharp items and detachable choking hazards.' },
  { id: 'original-nursery-fr-v1', language: 'fr', cycle: 'nursery', title: 'Trier et expliquer un choix',
    objective: 'Explorer un critère de regroupement choisi explicitement avec l’enseignant, sans notation numérique.',
    materials: 'Grandes cartes de formes et couleurs dessinées par l’adulte ; deux supports de classement.',
    steps: ['Décrire les cartes et montrer un exemple de regroupement.', 'Proposer un seul critère à la fois : même couleur ou même forme.', 'Inviter les enfants à classer quelques cartes puis à montrer ou expliquer leur choix.', 'Changer de critère uniquement si l’enseignant le juge approprié.'],
    differentiation: 'Réduire le choix à deux cartes, utiliser des contrastes adaptés et accepter une explication gestuelle.',
    observation: 'Consigner un exemple précis, avec ou sans aide. Ne pas déduire une maîtrise globale d’un seul tri.',
    safety: 'Cartes assez grandes, bords non coupants ; pas de petits jetons.' },
  { id: 'original-nursery-en-v1', language: 'en', cycle: 'nursery', title: 'Sort and explain a choice',
    objective: 'Explore one grouping rule explicitly chosen with the teacher, without numerical grading.',
    materials: 'Large shape and colour cards drawn by an adult; two sorting mats.',
    steps: ['Describe the cards and demonstrate one grouping.', 'Use one rule at a time: same colour or same shape.', 'Invite children to sort a few cards and show or explain their choice.', 'Change the rule only when the teacher considers it appropriate.'],
    differentiation: 'Offer a choice of two cards, adapt visual contrast and accept a gestural explanation.',
    observation: 'Record a specific example and any assistance. One sorting activity does not establish overall mastery.',
    safety: 'Use large cards with smooth edges; no small counters.' },
  { id: 'original-primary-fr-v1', language: 'fr', cycle: 'primary', title: 'Représenter un partage sur papier',
    objective: 'Faire représenter et expliquer un partage équitable ; les quantités et prérequis sont à choisir par l’enseignant.',
    materials: 'Feuilles, crayons et cercles dessinés représentant les groupes.',
    steps: ['Présenter une petite collection dessinée et un nombre de groupes adapté au niveau.', 'Laisser chaque élève proposer une répartition sur papier.', 'Comparer les représentations et demander comment vérifier l’équité.', 'Faire formuler une explication puis proposer un exemple différent choisi par l’enseignant.'],
    differentiation: 'Fournir des groupes pré-dessinés, autoriser une explication orale et ajuster les quantités sans modifier l’objectif annoncé.',
    observation: 'Conserver l’exemple, la réponse, la stratégie et l’aide. Distinguer non-réponse, erreur de calcul et justification incomplète.',
    safety: 'Matériel scolaire usuel adapté aux élèves ; aucun objet alimentaire ou petit matériel requis.' },
  { id: 'original-primary-en-v1', language: 'en', cycle: 'primary', title: 'Represent equal sharing on paper',
    objective: 'Represent and explain equal sharing; the teacher selects quantities and prerequisites.',
    materials: 'Paper, pencils and drawn circles representing groups.',
    steps: ['Present a small drawn collection and a number of groups appropriate to the class.', 'Allow each pupil to propose a distribution on paper.', 'Compare representations and ask how equal sharing can be checked.', 'Ask for an explanation, then introduce a different teacher-selected example.'],
    differentiation: 'Provide pre-drawn groups, allow an oral explanation and adjust quantities while preserving the stated objective.',
    observation: 'Keep the example, response, strategy and assistance. Distinguish no response, calculation errors and incomplete reasoning.',
    safety: 'Use age-appropriate ordinary school materials; no food or small objects are required.' },
  { id: 'original-secondary-fr-v1', language: 'fr', cycle: 'secondary', title: 'Comparer deux tableaux de proportionnalité',
    objective: 'Proposer une situation de justification, après vérification des prérequis et du rattachement au programme par l’enseignant.',
    materials: 'Deux petits tableaux construits par l’enseignant : un proportionnel et un non proportionnel ; papier.',
    steps: ['Demander quelles informations sont nécessaires pour comparer les tableaux.', 'Laisser rechercher et expliciter une méthode de vérification.', 'Comparer plusieurs justifications, notamment les contre-exemples.', 'Demander la construction d’un nouvel exemple et sa justification, sans noter automatiquement.'],
    differentiation: 'Réduire les valeurs, fournir une structure de phrase ou demander une justification plus générale selon les besoins.',
    observation: 'Conserver les calculs et arguments utilisés. Une note globale ne remplace pas une preuve rattachée à l’objectif.',
    safety: 'Aucune expérimentation physique ni collecte de données personnelles.' },
  { id: 'original-secondary-en-v1', language: 'en', cycle: 'secondary', title: 'Compare two ratio tables',
    objective: 'Offer a reasoning activity after the teacher checks prerequisites and curriculum alignment.',
    materials: 'Two small teacher-created tables: one proportional and one not proportional; paper.',
    steps: ['Ask what information is needed to compare the tables.', 'Allow pupils to develop and explain a checking method.', 'Compare justifications, including counterexamples.', 'Ask pupils to construct and justify a new example; do not grade automatically.'],
    differentiation: 'Simplify values, offer a sentence structure or request a more general justification according to need.',
    observation: 'Retain calculations and arguments. An overall grade is not a substitute for evidence linked to an objective.',
    safety: 'No physical experiment or personal-data collection.' },
];

export const originalTemplates: readonly OriginalTemplate[] = drafts.map(draft => ({
  ...draft, version: '1.0', sourceKind: 'original_assistant_draft', reviewStatus: 'pending', officialCurriculumId: null,
}));

export function templateText(resource: OriginalTemplate): string {
  const en = resource.language === 'en';
  return [en ? 'DRAFT - TEACHER REVIEW REQUIRED - NOT AN OFFICIAL CURRICULUM' : 'BROUILLON - RELECTURE ENSEIGNANT REQUISE - PAS UN PROGRAMME OFFICIEL',
    resource.title, 'ID: ' + resource.id + ' | Version: ' + resource.version,
    en ? 'Original assistant-authored project template; no third-party document reproduced.' : 'Modèle original rédigé avec un assistant pour le projet ; aucun document tiers reproduit.',
    (en ? 'Objective: ' : 'Objectif : ') + resource.objective,
    (en ? 'Materials: ' : 'Matériel : ') + resource.materials,
    ...resource.steps.map((step, index) => (index + 1) + '. ' + step),
    (en ? 'Differentiation: ' : 'Différenciation : ') + resource.differentiation,
    (en ? 'Observation: ' : 'Observation : ') + resource.observation,
    (en ? 'Safety: ' : 'Sécurité : ') + resource.safety,
    en ? 'No lesson has been taught or approved by downloading this template.' : 'Le téléchargement ne constitue ni un cours enseigné ni une validation pédagogique.',
  ].join('\n\n');
}
