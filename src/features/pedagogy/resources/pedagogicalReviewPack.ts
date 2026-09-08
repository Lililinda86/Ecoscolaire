import { originalTemplates, templateText } from './originalTemplates';
const ids = ['original-nursery-fr-v1', 'original-primary-fr-v1', 'original-primary-en-v1', 'original-secondary-fr-v1', 'original-secondary-en-v1'];
const examples: Record<string, { assessment: string; correction: string; remediation: string }> = {
  'original-nursery-fr-v1': {
    assessment: 'Bilan qualitatif proposé : présenter deux grandes cartes rouges et une bleue ; demander de réunir les rouges, après un exemple adulte. Noter geste, critère, contexte et aide. Ni /20 ni classement.',
    correction: 'Repère d’observation, pas corrigé noté : les deux cartes rouges sont réunies. Accepter une désignation gestuelle. Ne pas transformer une non-réponse en incapacité.',
    remediation: 'Si une difficulté est effectivement observée : proposer deux cartes très contrastées avec modèle adulte. Relever ensuite une nouvelle observation distincte, sans écraser la précédente.',
  },
  'original-primary-fr-v1': {
    assessment: 'Exemple interne à adapter, uniquement après enseignement confirmé de ce partage : 12 objets dessinés en 3 groupes égaux. QCM (8 pts) : nombre par groupe ? Choix : 3 / 4 / 6. Question courte (6 pts) : comment vérifier le partage ? Exercice (6 pts) : dessiner la répartition des 12 objets en 3 groupes.',
    correction: 'QCM : 4 (8 pts). Vérification : 3 groupes de 4 utilisent les 12 objets (3 pts pour égalité, 3 pour totalité). Dessin : 3 groupes (2 pts), 4 objets dans chacun (2 pts), 12 au total (2 pts). Total 20. Accepter toute représentation équivalente correcte.',
    remediation: 'Sur erreur attestée de partage : supports de groupes pré-dessinés et redistribution guidée. Réévaluer séparément le même objectif après accord enseignant reçu.',
  },
  'original-primary-en-v1': {
    assessment: 'Internal example, only after confirmed teaching: share 12 drawn objects into 3 equal groups. MCQ (8 points): how many per group? Choices: 3 / 4 / 6. Short answer (6): explain how to check. Exercise (6): draw all 12 objects in the 3 groups.',
    correction: 'MCQ: 4 (8). Explanation: equal groups (3), all 12 objects accounted for (3). Drawing: 3 groups (2), 4 in each (2), total 12 (2). Total 20. Accept equivalent correct representations.',
    remediation: 'After an observed sharing difficulty and received teacher agreement, offer pre-drawn groups and guided redistribution. Record a new separate observation for reassessment.',
  },
  'original-secondary-fr-v1': {
    assessment: 'Exemple interne après confirmation d’enseignement : tableau A : (1,2), (2,4), (3,6) ; tableau B : (1,2), (2,4), (3,7). QCM (8 pts) : lequel est proportionnel ? Choix : A seulement / B seulement / les deux / aucun. Question courte (6 pts) : justifier A. Exercice (6 pts) : donner le contre-exemple pour B.',
    correction: 'QCM : A seulement (8). A : le coefficient 2 est constant (3), vérification des trois lignes (3). B : 3 × 2 = 6 (3), mais la valeur fournie est 7, donc coefficient non constant (3). Total 20.',
    remediation: 'En cas de difficulté attestée, travailler sur deux colonnes à petit coefficient avec calculs explicites. Nouvelle preuve et décision humaine requises avant toute conclusion de progrès.',
  },
  'original-secondary-en-v1': {
    assessment: 'Internal example after confirmed teaching: table A: (1,2), (2,4), (3,6); table B: (1,2), (2,4), (3,7). MCQ (8): which is proportional? Choices: A only / B only / both / neither. Short answer (6): justify A. Exercise (6): give the counterexample for B.',
    correction: 'MCQ: A only (8). A: constant multiplier 2 (3), check all three rows (3). B: 3 × 2 = 6 (3), whereas its entry is 7, so the multiplier is not constant (3). Total 20.',
    remediation: 'For an evidenced difficulty, use small constant multipliers and explicit calculations with teacher agreement. Record a new observation; never infer progress from completion alone.',
  },
};
export function pedagogicalReviewPackText(): string {
  return ['# PEDAGOGICAL_REVIEW_PACK',
    'STATUS: DRAFT — HUMAN APPROVAL NOT PERFORMED',
    'Five representative cycle/language examples, not exhaustive curriculum coverage. Specific ITALO class/level, prerequisites and suitability require human mapping.',
    'Source: original assistant-authored ITALO project resources. No official curriculum, third-party document, actual taught lesson, pupil result or teacher decision is asserted.',
    'Before use: authenticate the applicable MINEDUB/MINESEC source, record exact page/objective, rights, version and received adoption decision. If pre-nursery lies outside verified scope, use ITALO_EARLY_YEARS_PROGRAM with human review, not a MINEDUB label.',
    'Planning below is an Ecoscolaire proposal, never a ministry-prescribed weekly allocation.',
    ...ids.map(id => {
      const resource = originalTemplates.find(row => row.id === id)!;
      const example = examples[id];
      return ['## ' + resource.cycle + ' / ' + resource.language.toUpperCase(),
        'Source locator: internal resource ' + id + ', version ' + resource.version + '. Official locator: MISSING.',
        'Progression proposed: verify prerequisites → model → guided attempt → independent evidence → review → support → new evidence. Scheduling and duration: teacher decision pending.',
        templateText(resource), '### Assessment / bilan\n' + example.assessment,
        '### Correction / observation criteria\n' + example.correction,
        '### Competency evidence\n' + resource.observation + ' Link only to the exact objective; no automatic official competency equivalence or overall mastery.',
        '### Remediation / reassessment\n' + example.remediation,
        '### Human decision form\nReviewer: ______  Date: ______  Class/level: ______\nOfficial source/version/page and rights: ______\nPrerequisites checked: ______\nCorrections requested: ______\nDecision actually received: pending / revise / approve\nTeaching actually confirmed: NOT RECORDED\nReassessment evidence: NOT RECORDED',
      ].join('\n\n');
    }),
  ].join('\n\n');
}
