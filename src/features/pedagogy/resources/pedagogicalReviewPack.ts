import { originalTemplates, templateText } from './originalTemplates';
import { structuredReviewExcerpts, minedubDocuments } from './minedubVerified';
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
export const syntheticReviewCases = ids.map(id => ({ template: originalTemplates.find(item => item.id === id)!, ...examples[id] }));
export function pedagogicalReviewPackText(): string {
  return ['# PEDAGOGICAL_REVIEW_PACK',
    'STATUS: DRAFT — HUMAN APPROVAL NOT PERFORMED',
    'Five representative cycle/language examples, not exhaustive curriculum coverage. Specific ITALO class/level, prerequisites and suitability require human mapping.',
    'Sources: authenticated MINEDUB 2018 documents with short located paraphrases where available; original assistant-authored ITALO exercises remain separate. No actual taught lesson, pupil result or teacher decision is asserted. Official document authenticity does not establish current applicability, redistribution rights or adoption.',
    'Before use: authenticate the applicable MINEDUB/MINESEC source, record exact page/objective, rights, version and received adoption decision. If pre-nursery lies outside verified scope, use ITALO_EARLY_YEARS_PROGRAM with human review, not a MINEDUB label.',
    'Planning below is an Ecoscolaire proposal, never a ministry-prescribed weekly allocation.',
    ...ids.map(id => {
      const resource = originalTemplates.find(row => row.id === id)!;
      const example = examples[id];
      const excerptId = id.includes('nursery') ? 'nursery-fr-sorting' : id.includes('primary-fr') ? 'primary-fr-sharing' : id.includes('primary-en') ? 'primary-en-sharing' : null;
      const excerpt = structuredReviewExcerpts.find(row => row.id === excerptId);
      const document = minedubDocuments.find(row => row.id === excerpt?.documentId);
      return ['## ' + resource.cycle + ' / ' + resource.language.toUpperCase(),
        '### 1. Source and status\n' + (document ? document.title + ', cover edition 2018. OFFICIAL_VERIFIED (authorship only). https://www.minedub.cm/download/350/archives/' + document.download + '\nSHA-256: ' + document.sha + '\nRights UNKNOWN / LINK_ONLY; current applicability and ITALO mapping PENDING.' : 'MINESEC curriculum: MISSING / CHECK_FAILED, official catalogue requests timed out. This internal example is NOT an official programme. Secondary FR/EN level mapping remains unconfirmed.'),
        '### 2. Structured source excerpt\n' + (excerpt ? JSON.stringify(excerpt, null, 2) : 'No authenticated official excerpt. Subject: mathematics; unit, official lesson, competency, recommended hours, page: null. Internal objective: distinguish constant from nonconstant multipliers. Do not populate official fields from this example.'),
        '### 3. Proposed planning\nEcoscolaire proposal: prerequisites → model → guided attempt → independent evidence → review → support → new evidence. Scheduling and duration: teacher decision pending. Not a ministry-prescribed weekly allocation.',
        '### 4. Template\n' + templateText(resource),
        '### 5. Synthetic preparation\nIdentifier: review-' + id + '; version 1; status DRAFT. Objective: ' + resource.objective + '\nContent: ' + resource.steps.join(' ') + '\nNo teacher validation or classroom teaching recorded.',
        '### 6. Taught snapshot scenario\nHypothetical fixture only: after received validation and teaching confirmation, snapshot review-' + id + '@1 may include ONLY the activity explicitly taught. Confirmation, effective date and production checksum: NOT RECORDED. Unfinished steps stay excluded. The application binds immutable source/portion hashes; changed content invalidates visas. Do not copy this scenario as a real confirmation.',
        '### 7. Assessment / bilan\n' + example.assessment + '\nUse only when each question AND answer/correction is supported by the confirmed taught snapshot. Unknown scope: NEEDS_REVIEW. No automatic approval.',
        '### 8. Correction / observation criteria\n' + example.correction,
        '### 9. Results and competency evidence\nSynthetic scenario only: record an observed sharing/sorting/calculation attempt and its assistance, not a fabricated pupil result. ' + resource.observation + ' Link only to the exact objective; no automatic official competency equivalence or overall mastery from /20. Reuse Lot D and existing grade links, never a parallel gradebook.',
        '### 10. Remediation / reassessment\n' + example.remediation,
        '### 11. Human questions and decision checklist\nIs the proposed source edition and class mapping applicable? Are prerequisites and language suitable? Does every answer and explanation stay inside taught portions? Is duration/barème appropriate? Is support accessible and safe?\nReviewer: ______  Date: ______  Class/level: ______\nOfficial source/version/page and rights: ______\nPrerequisites checked: ______\nCorrections requested: ______\n[ ] APPROVE\n[ ] REQUEST_CHANGE\n[ ] NOT_APPLICABLE\nDecision actually received: PENDING\nTeaching actually confirmed: NOT RECORDED\nReassessment evidence: NOT RECORDED',
      ].join('\n\n');
    }),
    '## Early years boundary\nPrématernelle / Pre-nursery: ITALO_EARLY_YEARS_PROGRAM / ITALO_INTERNAL / PEDAGOGICAL_APPROVAL_REQUIRED. No separate official scope authenticated. The nursery source is not silently extended to pre-nursery or to a third local nursery year. No mandatory numerical score.',
  ].join('\n\n');
}
