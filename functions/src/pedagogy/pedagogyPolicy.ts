export type EducationStage = 'pre_nursery' | 'preschool' | 'primary' | 'secondary' | 'unknown';
export interface PedagogyPolicy {
  version: number;
  stage: EducationStage;
  language: 'fr' | 'en';
  assessmentMode: 'numeric' | 'observation';
  totalPoints: number | null;
  durationMinutes: number;
  mastery: { minimumEvidence: number; minimumDistinctDates: number; acquiredThreshold: number; developingThreshold: number; version: number };
}
type ClassIdentity = { catalogLevelId?: string; name?: string; cycle?: string; level?: string; type?: string; section?: string };
// This classifies local activity formats; it never asserts equivalence with an official curriculum level.
export function localEducationStage(classroom: ClassIdentity): EducationStage {
  const id = classroom.catalogLevelId || '';
  const name = (classroom.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (['fr-preschool-pre', 'en-nursery-pre'].includes(id) || /^(pre[- ]?maternelle|pre[- ]?nursery)$/.test(name)) return 'pre_nursery';
  if (id.startsWith('fr-preschool-') || id.startsWith('en-nursery-') || /maternelle|nursery|^(petite|moyenne|grande) section$/.test(name) || ['nursery', 'preschool', 'maternelle'].includes(classroom.cycle || classroom.level || '')) return 'preschool';
  if (id.includes('-secondary-') || classroom.cycle === 'secondary' || /^(form [1-5]|[3-6](e|eme)|2nde|1re|terminale|lower sixth|upper sixth)$/.test(name)) return 'secondary';
  if (id.includes('-primary-') || classroom.cycle === 'primary' || /^(sil|cp|ce[12]|cm[12]|class [1-6])$/.test(name)) return 'primary';
  return 'unknown';
}
export function defaultPedagogyPolicy(classroom: ClassIdentity): PedagogyPolicy {
  const stage = localEducationStage(classroom);
  const observation = ['pre_nursery', 'preschool'].includes(stage);
  return { version: 1, stage, language: (classroom.section || classroom.type) === 'anglophone' ? 'en' : 'fr',
    assessmentMode: observation ? 'observation' : 'numeric', totalPoints: observation ? null : 20, durationMinutes: observation ? 20 : 60,
    mastery: { minimumEvidence: 3, minimumDistinctDates: 2, acquiredThreshold: 80, developingThreshold: 50, version: 1 } };
}
export function parsePedagogyPolicy(raw: unknown, classroom: ClassIdentity, nextVersion: number): PedagogyPolicy {
  if (!raw || typeof raw !== 'object') throw new Error('INVALID_PEDAGOGY_POLICY');
  const value = raw as PedagogyPolicy;
  if (!['pre_nursery', 'preschool', 'primary', 'secondary'].includes(value.stage) || !['fr', 'en'].includes(value.language) || !['numeric', 'observation'].includes(value.assessmentMode)) throw new Error('INVALID_PEDAGOGY_POLICY');
  const localStage = localEducationStage(classroom);
  if (localStage !== 'unknown' && value.stage !== localStage) throw new Error('CLASS_STAGE_MISMATCH');
  if (['pre_nursery', 'preschool'].includes(value.stage) && (value.assessmentMode !== 'observation' || value.totalPoints !== null)) throw new Error('PRESCHOOL_REQUIRES_NON_NUMERIC_OBSERVATION');
  if (value.assessmentMode === 'observation' && value.totalPoints !== null) throw new Error('OBSERVATION_HAS_NO_NUMERIC_SCORE');
  if (value.assessmentMode === 'numeric' && (typeof value.totalPoints !== 'number' || !Number.isInteger(value.totalPoints * 100) || value.totalPoints < 1 || value.totalPoints > 100)) throw new Error('INVALID_ASSESSMENT_SCALE');
  if (!Number.isInteger(value.durationMinutes) || value.durationMinutes < 10 || value.durationMinutes > 300) throw new Error('INVALID_ASSESSMENT_DURATION');
  const mastery = value.mastery;
  if (!mastery || !Number.isInteger(mastery.minimumEvidence) || mastery.minimumEvidence < 2 || mastery.minimumEvidence > 20 || !Number.isInteger(mastery.minimumDistinctDates) || mastery.minimumDistinctDates < 2 || mastery.minimumDistinctDates > mastery.minimumEvidence ||
      !Number.isFinite(mastery.acquiredThreshold) || !Number.isFinite(mastery.developingThreshold) || mastery.developingThreshold < 0 || mastery.acquiredThreshold > 100 || mastery.developingThreshold >= mastery.acquiredThreshold) throw new Error('INVALID_MASTERY_POLICY');
  return { version: nextVersion, stage: value.stage, language: value.language, assessmentMode: value.assessmentMode, totalPoints: value.totalPoints,
    durationMinutes: value.durationMinutes, mastery: { minimumEvidence: mastery.minimumEvidence, minimumDistinctDates: mastery.minimumDistinctDates, acquiredThreshold: mastery.acquiredThreshold, developingThreshold: mastery.developingThreshold, version: nextVersion } };
}
export const OBSERVATION_STATES = ['not_observed', 'discovering', 'developing', 'acquired'] as const;
export type ObservationState = typeof OBSERVATION_STATES[number];
export interface LearningEvidence {
  id: string; competencyId: string | null; date: string; sourceId: string;
  resultStatus: 'scored' | 'absent' | 'not_evaluated' | 'not_submitted' | 'missing' | 'observation';
  score?: number; maxScore?: number; observation?: ObservationState; superseded?: boolean;
}
export function masteryFromEvidence(competencyId: string, records: LearningEvidence[], policy: PedagogyPolicy['mastery']) {
  const bySource = new Map<string, LearningEvidence[]>();
  for (const row of records.filter(row => !row.superseded && row.competencyId === competencyId)) {
    bySource.set(row.sourceId, [...(bySource.get(row.sourceId) || []), row]);
  }
  // Ambiguous current revisions cannot become extra evidence or depend on query ordering.
  const unambiguous = [...bySource.values()].filter(rows => rows.length === 1).map(rows => rows[0]);
  const usable = unambiguous.filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(Date.parse(row.date)) && new Date(row.date).toISOString().slice(0, 10) === row.date && (
    row.resultStatus === 'scored' && typeof row.score === 'number' && Number.isFinite(row.score) && row.score >= 0 && typeof row.maxScore === 'number' && Number.isFinite(row.maxScore) && row.maxScore > 0 && row.score <= row.maxScore ||
    row.resultStatus === 'observation' && row.observation && OBSERVATION_STATES.includes(row.observation) && row.observation !== 'not_observed'));
  const dates = new Set(usable.map(row => row.date)).size;
  const metadata = { policyVersion: policy.version, evidenceIds: usable.map(row => row.id), evidenceCount: usable.length, distinctDates: dates };
  if (usable.length < policy.minimumEvidence || dates < policy.minimumDistinctDates) return { ...metadata, state: 'insufficient_data' as const, explanation: 'Données insuffisantes : plusieurs preuves indépendantes et datées sont nécessaires.' };
  const qualitative = usable.filter(row => row.resultStatus === 'observation');
  if (qualitative.length) {
    if (qualitative.length !== usable.length) return { ...metadata, state: 'insufficient_data' as const, explanation: 'Preuves hétérogènes : revue pédagogique requise, sans conversion implicite en note.' };
    const recent = qualitative.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, policy.minimumEvidence);
    const state = recent.every(row => row.observation === 'acquired') ? 'acquired' : recent.some(row => row.observation === 'developing' || row.observation === 'acquired') ? 'developing' : 'discovering';
    return { ...metadata, state, explanation: 'Synthèse de plusieurs observations contextualisées ; ne constitue pas un diagnostic.' };
  }
  const mean = usable.reduce((sum, row) => sum + row.score! * 100 / row.maxScore!, 0) / usable.length;
  return { ...metadata, state: mean >= policy.acquiredThreshold ? 'acquired' : mean >= policy.developingThreshold ? 'developing' : 'needs_support', meanPercent: Math.round(mean * 100) / 100,
    explanation: 'Moyenne des preuves explicitement rattachées à cette compétence, selon les seuils de la politique versionnée.' };
}
