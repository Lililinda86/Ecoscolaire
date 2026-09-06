import { createHash } from 'node:crypto';

export const ASSESSMENT_TIME_ZONE = 'Africa/Douala';
export const DEFAULT_ASSESSMENT_POLICY = { totalPoints: 20, durationMinutes: 60 } as const;
export const QUESTION_TYPES = ['short_answer', 'multiple_choice', 'true_false', 'fill_blank', 'exercise'] as const;
export type AssessmentQuestionType = typeof QUESTION_TYPES[number];
export type WeeklyAssessmentStatus = 'draft' | 'generating' | 'needs_review' | 'teacher_validated' | 'ready_to_print' | 'failed' | 'archived';
const transitions: Record<WeeklyAssessmentStatus, WeeklyAssessmentStatus[]> = {
  draft: ['generating', 'archived'], generating: ['needs_review', 'failed'], needs_review: ['generating', 'teacher_validated', 'archived'],
  teacher_validated: ['generating', 'ready_to_print', 'archived'], ready_to_print: ['generating', 'archived'],
  failed: ['generating', 'needs_review', 'archived'], archived: []
};
export const canTransitionWeeklyAssessment = (from: WeeklyAssessmentStatus, to: WeeklyAssessmentStatus): boolean => transitions[from].includes(to);

export interface ValidatedPreparationSource {
  id: string;
  version: number;
  subjectId: string;
  classSubjectId: string;
  subjectName: string;
  curriculumUnitId: string | null;
  lessonTitle: string | null;
  objective: string | null;
  pedagogicalContent: string;
  teachingConfirmationId?: string;
  teachingStatus?: 'taught' | 'partially_taught';
  effectiveTeachingDate?: string;
}

export interface WeeklyAssessmentGenerationInput {
  school: { id: string; name: string };
  academicYear: { id: string; name: string };
  class: { id: string; name: string };
  week: { id: string; startDate: string; endDate: string; fridayDate: string };
  validatedPreparations: ValidatedPreparationSource[];
  subjects: Array<{ id: string; name: string }>;
  pedagogicalContent: ValidatedPreparationSource[];
  assessmentPolicy: { totalPoints: number; durationMinutes: number };
}

export interface GeneratedAssessmentItem {
  subjectId: string;
  classSubjectId: string;
  sourceLessonPreparationIds: string[];
  sourceCurriculumUnitIds: string[];
  questionType: AssessmentQuestionType;
  questionText: string;
  instructions: string;
  points: number;
  expectedAnswer: string;
  correctionGuide: string;
  difficulty: 'easy' | 'medium' | 'hard';
  order: number;
}

export interface WeeklyAssessmentGenerationResult {
  schemaVersion: 'weekly-assessment-generation-v1';
  title: string;
  instructions: string;
  durationMinutes: number;
  totalPoints: number;
  sections: Array<{ subjectId: string; title: string; itemOrders: number[]; points: number }>;
  items: GeneratedAssessmentItem[];
  coverageSummary: { coveredSubjectIds: string[]; validatedPreparationCount: number };
  warnings: string[];
}

export interface WeeklyAssessmentGenerator {
  readonly provider: string;
  readonly version: string;
  generate(input: WeeklyAssessmentGenerationInput): Promise<WeeklyAssessmentGenerationResult>;
}

const isoDate = (value: string): Date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_DATE');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('INVALID_DATE');
  return date;
};

const dateIsoInDouala = (instant: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ASSESSMENT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export const schoolWeekInDouala = (instant: Date = new Date()): { monday: string; friday: string } => {
  const localIso = dateIsoInDouala(instant);
  const date = isoDate(localIso);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  const monday = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 4);
  return { monday, friday: date.toISOString().slice(0, 10) };
};

export const fridayForWeek = (weekStartDate: string): string => {
  const date = isoDate(weekStartDate);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day) + 4);
  return date.toISOString().slice(0, 10);
};

const stableSource = (source: ValidatedPreparationSource) => ({
  id: source.id, version: source.version, subjectId: source.subjectId, classSubjectId: source.classSubjectId,
  curriculumUnitId: source.curriculumUnitId, lessonTitle: source.lessonTitle, objective: source.objective,
  pedagogicalContent: source.pedagogicalContent,
  teachingConfirmationId: source.teachingConfirmationId || null,
  teachingStatus: source.teachingStatus || null,
  effectiveTeachingDate: source.effectiveTeachingDate || null
});

export const sourceChecksum = (sources: ValidatedPreparationSource[]): string => createHash('sha256')
  .update(JSON.stringify([...sources].sort((a, b) => a.id.localeCompare(b.id)).map(stableSource)))
  .digest('hex');
export const hasAssessmentSourceChanged = (storedChecksum: string | undefined, current: ValidatedPreparationSource[]): boolean =>
  Boolean(storedChecksum && storedChecksum !== sourceChecksum(current));

export const assessmentId = (schoolId: string, academicYearId: string, classId: string, weekId: string): string =>
  [schoolId, academicYearId, classId, weekId].join('__');

export const coverageFor = (
  expected: Array<{ subjectId: string; subjectName?: string }>,
  validated: Array<{ subjectId: string; subjectName?: string }>
) => {
  const expectedSubjects = new Map(expected.map(item => [item.subjectId, item.subjectName || item.subjectId]));
  const coveredSubjects = new Map(validated.map(item => [item.subjectId, item.subjectName || item.subjectId]));
  const missingSubjects = [...expectedSubjects].filter(([id]) => !coveredSubjects.has(id)).map(([id, name]) => ({ id, name }));
  const expectedPreparationCount = expected.length;
  const validatedPreparationCount = validated.length;
  const coveragePercent = expectedPreparationCount ? Math.round(validatedPreparationCount * 10000 / expectedPreparationCount) / 100 : 0;
  return {
    coveredSubjects: [...coveredSubjects].map(([id, name]) => ({ id, name })), missingSubjects,
    expectedPreparationCount, validatedPreparationCount, coveragePercent: Math.min(100, coveragePercent)
  };
};

const boundedText = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export const validateWeeklyAssessmentResult = (raw: unknown): WeeklyAssessmentGenerationResult => {
  if (!raw || typeof raw !== 'object') throw new Error('INVALID_WEEKLY_ASSESSMENT_SCHEMA');
  const value = raw as WeeklyAssessmentGenerationResult;
  if (value.schemaVersion !== 'weekly-assessment-generation-v1' || !boundedText(value.title, 300) || !boundedText(value.instructions, 2000)) throw new Error('INVALID_WEEKLY_ASSESSMENT_SCHEMA');
  if (!Number.isInteger(value.durationMinutes) || value.durationMinutes < 10 || value.durationMinutes > 300 || !Number.isFinite(value.totalPoints) || value.totalPoints <= 0 || value.totalPoints > 100) throw new Error('INVALID_WEEKLY_ASSESSMENT_SCHEMA');
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 100 || !Array.isArray(value.sections) || !Array.isArray(value.warnings)) throw new Error('INVALID_WEEKLY_ASSESSMENT_SCHEMA');
  const sourceIds = new Set<string>();
  for (const [index, item] of value.items.entries()) {
    if (!boundedText(item.subjectId, 100) || !boundedText(item.classSubjectId, 100) || !QUESTION_TYPES.includes(item.questionType) ||
        !boundedText(item.questionText, 2000) || !boundedText(item.instructions, 1000) || !boundedText(item.expectedAnswer, 3000) ||
        !boundedText(item.correctionGuide, 3000) || !['easy', 'medium', 'hard'].includes(item.difficulty) ||
        !Number.isFinite(item.points) || item.points <= 0 || item.order !== index + 1 || !item.sourceLessonPreparationIds?.length) {
      throw new Error('INVALID_WEEKLY_ASSESSMENT_SCHEMA');
    }
    item.sourceLessonPreparationIds.forEach(id => sourceIds.add(id));
  }
  const total = value.items.reduce((sum, item) => sum + item.points, 0);
  if (Math.abs(total - value.totalPoints) > 0.0001 || sourceIds.size < 1) throw new Error('INVALID_WEEKLY_ASSESSMENT_TOTAL');
  return value;
};

const questionFor = (source: ValidatedPreparationSource, type: AssessmentQuestionType): Pick<GeneratedAssessmentItem, 'questionText' | 'instructions' | 'expectedAnswer' | 'correctionGuide'> => {
  const topic = source.lessonTitle || source.objective || `la notion étudiée en ${source.subjectName}`;
  if (type === 'multiple_choice') return { questionText: `Choisis la proposition correcte concernant ${topic}.`, instructions: 'Entoure une seule réponse et justifie brièvement.', expectedAnswer: `Réponse cohérente avec la préparation « ${topic} ».`, correctionGuide: 'Accorder les points si le choix et la justification correspondent au contenu validé.' };
  if (type === 'true_false') return { questionText: `Vrai ou faux : explique une règle importante liée à ${topic}.`, instructions: 'Indique Vrai ou Faux puis justifie.', expectedAnswer: `Justification conforme à la préparation « ${topic} ».`, correctionGuide: 'Vérifier la décision et la justification, sans exiger une formulation unique.' };
  if (type === 'fill_blank') return { questionText: `Complète la phrase de synthèse sur ${topic}.`, instructions: 'Complète avec les mots étudiés en classe.', expectedAnswer: `Vocabulaire issu de la préparation « ${topic} ».`, correctionGuide: 'Accepter tout synonyme prévu par le contenu pédagogique validé.' };
  if (type === 'exercise') return { questionText: `Résous une situation d’application sur ${topic}.`, instructions: 'Présente les étapes de ton raisonnement.', expectedAnswer: `Démarche et résultat conformes à l’objectif : ${source.objective || topic}.`, correctionGuide: 'Répartir les points entre démarche, exactitude et présentation.' };
  return { questionText: `Explique avec tes mots ce que tu as appris sur ${topic}.`, instructions: 'Rédige une réponse courte et précise.', expectedAnswer: `Éléments essentiels de la préparation « ${topic} ».`, correctionGuide: 'Attribuer les points selon la présence des éléments essentiels du cours validé.' };
};

export const deterministicWeeklyAssessmentGenerator: WeeklyAssessmentGenerator = {
  provider: 'mock', version: 'mock-weekly-assessment-v1',
  async generate(input) {
    if (!input.validatedPreparations.length) throw new Error('NO_VALIDATED_PREPARATIONS');
    if (input.class.name.includes('[generator-fail]')) throw new Error('MOCK_WEEKLY_ASSESSMENT_FAILURE');
    const sources = [...input.validatedPreparations].sort((a, b) => a.subjectName.localeCompare(b.subjectName) || a.id.localeCompare(b.id));
    const unit = Math.floor(input.assessmentPolicy.totalPoints * 100 / sources.length) / 100;
    let assigned = 0;
    const items: GeneratedAssessmentItem[] = sources.map((source, index) => {
      const points = index === sources.length - 1 ? Math.round((input.assessmentPolicy.totalPoints - assigned) * 100) / 100 : unit;
      assigned += points;
      const questionType = QUESTION_TYPES[index % QUESTION_TYPES.length];
      return {
        subjectId: source.subjectId, classSubjectId: source.classSubjectId,
        sourceLessonPreparationIds: [source.id], sourceCurriculumUnitIds: source.curriculumUnitId ? [source.curriculumUnitId] : [],
        questionType, ...questionFor(source, questionType), points,
        difficulty: index % 3 === 0 ? 'easy' : index % 3 === 1 ? 'medium' : 'hard', order: index + 1
      };
    });
    const sections = [...new Set(sources.map(item => item.subjectId))].map(subjectId => {
      const indexes = items.filter(item => item.subjectId === subjectId);
      return { subjectId, title: sources.find(item => item.subjectId === subjectId)?.subjectName || subjectId, itemOrders: indexes.map(item => item.order), points: indexes.reduce((sum, item) => sum + item.points, 0) };
    });
    return validateWeeklyAssessmentResult({
      schemaVersion: 'weekly-assessment-generation-v1', title: `Évaluation hebdomadaire — ${input.class.name}`,
      instructions: 'Lis attentivement chaque consigne. Présente clairement tes réponses.',
      durationMinutes: input.assessmentPolicy.durationMinutes, totalPoints: input.assessmentPolicy.totalPoints,
      sections, items, coverageSummary: { coveredSubjectIds: [...new Set(sources.map(item => item.subjectId))], validatedPreparationCount: sources.length }, warnings: []
    });
  }
};
