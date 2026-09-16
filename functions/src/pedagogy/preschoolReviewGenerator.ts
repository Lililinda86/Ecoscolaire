import { createHash } from 'node:crypto';
import { admissibleTeachingContent, ReviewedPreparation } from './teachingEvidence';
import { OBSERVATION_STATES, PedagogyPolicy } from './pedagogyPolicy';

export interface PreschoolPreparation extends ReviewedPreparation {
  id: string; version: number; subjectId: string; subjectName: string;
}
/** A deterministic observation guide, never an AI answer, child observation,
 * ministry competency, or teacher approval. Content is copied ONLY from the
 * admissible confirmed portion; no external resource can add an activity. */
export function preschoolReviewProposal(preparations: PreschoolPreparation[], policy: PedagogyPolicy) {
  if (!['pre_nursery', 'preschool'].includes(policy.stage) || policy.assessmentMode !== 'observation' || policy.totalPoints !== null) throw Error('PRESCHOOL_OBSERVATION_POLICY_REQUIRED');
  if (preparations.length > 250 || new Set(preparations.map(p => p.id)).size !== preparations.length) throw Error('INVALID_PREPARATION_SNAPSHOT');
  const en = policy.language === 'en';
  const excluded: { preparationId: string; reason: string }[] = [];
  const activities = [...preparations].sort((a, b) => a.id.localeCompare(b.id)).flatMap(preparation => {
    const { content, exclusion } = admissibleTeachingContent(preparation);
    if (exclusion) { excluded.push({ preparationId: preparation.id, reason: exclusion }); return []; }
    const confirmation = preparation.teachingConfirmation!;
    return [{ preparationId: preparation.id, preparationVersion: preparation.version, subjectId: preparation.subjectId, domainLabel: preparation.subjectName,
      confirmationId: confirmation.id, effectiveDate: confirmation.effectiveDate, partial: confirmation.status === 'partially_taught',
      confirmedContent: content,
      observationPrompt: en ? 'Revisit only the confirmed activity, using its familiar materials. Note what the child does or says and the support provided; do not add a new task.' : 'Reprendre uniquement l’activité confirmée avec son matériel familier. Noter ce que l’enfant fait ou dit et l’aide apportée ; ne pas ajouter de tâche nouvelle.',
      adaptationPrompt: en ? 'Offer repetition, modelling or a smaller group within the same activity; let the teacher choose the suitable support.' : 'Proposer répétition, démonstration ou petit groupe dans la même activité ; l’enseignant choisit l’aide adaptée.' }];
  });
  const sourceChecksum = createHash('sha256').update(JSON.stringify({ activities, excluded, policy })).digest('hex');
  return { kind: 'PRESCHOOL_WEEKLY_REVIEW' as const, version: 'preschool-confirmed-activities-v1', language: policy.language,
    title: en ? 'Preschool weekly review' : 'Bilan hebdomadaire préscolaire',
    status: 'needs_review' as const, sourceChecksum, activities, excluded, observationStates: [...OBSERVATION_STATES], totalPoints: null,
    observationRecorded: false, teacherValidated: false, generatorProvider: 'deterministic-no-provider',
    notice: en ? 'Proposed observation guide, not an assessment result or a developmental diagnosis. No marks, averages or ranking. Teacher review is required.' : 'Guide d’observation proposé, pas un résultat ni un diagnostic de développement. Sans note, moyenne ou classement. Revue enseignant nécessaire.' };
}
