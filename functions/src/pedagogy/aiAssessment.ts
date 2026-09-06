import { requestStructuredPedagogyAi } from './aiGateway';
import { deterministicWeeklyAssessmentGenerator, QUESTION_TYPES, sourceChecksum, validateWeeklyAssessmentResult, WeeklyAssessmentGenerationInput } from './weeklyAssessmentGenerator';

const text = { type: 'string' };
const texts = { type: 'array', items: text };
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const assessmentAiSchema = object({
  schemaVersion: { type: 'string', enum: ['weekly-assessment-generation-v1'] }, title: text, instructions: text, durationMinutes: { type: 'integer' }, totalPoints: { type: 'number' },
  sections: { type: 'array', items: object({ subjectId: text, title: text, itemOrders: { type: 'array', items: { type: 'integer' } }, points: { type: 'number' } }) },
  items: { type: 'array', items: object({ subjectId: text, classSubjectId: text, sourceLessonPreparationIds: texts, sourceCurriculumUnitIds: texts,
    questionType: { type: 'string', enum: [...QUESTION_TYPES] }, questionText: text, instructions: text, points: { type: 'number' }, expectedAnswer: text, correctionGuide: text,
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] }, order: { type: 'integer' } }) },
  coverageSummary: object({ coveredSubjectIds: texts, validatedPreparationCount: { type: 'integer' } }), warnings: texts
});

export async function generateAssessmentContent(schoolId: string, input: WeeklyAssessmentGenerationInput, language: 'fr' | 'en') {
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
  if (process.env.FUNCTIONS_EMULATOR === 'true' && project.startsWith('demo-')) {
    return { generated: await deterministicWeeklyAssessmentGenerator.generate(input), provider: 'mock', version: deterministicWeeklyAssessmentGenerator.version, operationId: null };
  }
  const sources = input.validatedPreparations;
  const subjectIds = [...new Set(sources.map(source => source.subjectId))];
  const classSubjectIds = [...new Set(sources.map(source => source.classSubjectId))];
  const sanitized = sources.map((source, index) => ({
    id: `source_${index + 1}`, subjectId: `subject_${subjectIds.indexOf(source.subjectId) + 1}`, classSubjectId: `class_subject_${classSubjectIds.indexOf(source.classSubjectId) + 1}`,
    subjectName: source.subjectName, content: source.pedagogicalContent
  }));
  const response = await requestStructuredPedagogyAi(schoolId, {
    purpose: 'weekly_assessment', sourceKey: sourceChecksum(sources), schema: assessmentAiSchema,
    instructions: `Prepare a usable weekly assessment draft entirely in ${language === 'en' ? 'English' : 'French'}. Use ONLY the confirmed taught content supplied. No broader lesson titles or unconfirmed portions may be introduced. Write complete, answerable questions, actual multiple-choice options or actual statements where applicable, precise expected answers and a usable correction guide. The sum of points must equal the policy total; each section must exactly match its questions. Reference only the supplied source/subject identifiers. sourceCurriculumUnitIds must be empty because no official curriculum evidence is supplied. Do not invent missing content. No teacher validation is implied.`,
    content: JSON.stringify({ language, policy: input.assessmentPolicy, sources: sanitized })
  });
  const generated = validateWeeklyAssessmentResult(response.data);
  if (generated.totalPoints !== input.assessmentPolicy.totalPoints || generated.durationMinutes !== input.assessmentPolicy.durationMinutes) throw new Error('AI_ASSESSMENT_POLICY_MISMATCH');
  const sourceMap = new Map(sanitized.map((source, index) => [source.id, sources[index]]));
  const subjectMap = new Map(subjectIds.map((id, index) => [`subject_${index + 1}`, id]));
  const classSubjectMap = new Map(classSubjectIds.map((id, index) => [`class_subject_${index + 1}`, id]));
  for (const item of generated.items) {
    const subjectId = subjectMap.get(item.subjectId), classSubjectId = classSubjectMap.get(item.classSubjectId);
    if (!subjectId || !classSubjectId || item.sourceCurriculumUnitIds.length || item.sourceLessonPreparationIds.some(id => !sourceMap.has(id) || sourceMap.get(id)!.subjectId !== subjectId || sourceMap.get(id)!.classSubjectId !== classSubjectId)) throw new Error('AI_ASSESSMENT_UNKNOWN_SOURCE');
    item.subjectId = subjectId; item.classSubjectId = classSubjectId;
    item.sourceLessonPreparationIds = [...new Set(item.sourceLessonPreparationIds.map(id => sourceMap.get(id)!.id))];
  }
  const sectionsSeen = new Set<string>();
  for (const section of generated.sections) {
    const subjectId = subjectMap.get(section.subjectId);
    if (!subjectId || sectionsSeen.has(subjectId)) throw new Error('AI_ASSESSMENT_SECTION_MISMATCH');
    sectionsSeen.add(subjectId);
    const items = generated.items.filter(item => item.subjectId === subjectId);
    if (!items.length || JSON.stringify(items.map(item => item.order)) !== JSON.stringify(section.itemOrders) || Math.abs(items.reduce((sum, item) => sum + item.points, 0) - section.points) > .0001) throw new Error('AI_ASSESSMENT_SECTION_MISMATCH');
    section.subjectId = subjectId;
  }
  if (generated.items.some(item => !sectionsSeen.has(item.subjectId))) throw new Error('AI_ASSESSMENT_SECTION_MISSING');
  generated.coverageSummary = { coveredSubjectIds: [...sectionsSeen], validatedPreparationCount: new Set(generated.items.flatMap(item => item.sourceLessonPreparationIds)).size };
  // Every confirmed source must be addressed or generation fails visibly; no fabricated coverage.
  if (generated.coverageSummary.validatedPreparationCount !== sources.length) throw new Error('AI_ASSESSMENT_SOURCE_OMITTED');
  return { generated, provider: response.provider, version: `${response.protocolVersion}:${response.model}`, operationId: response.operationId };
}
