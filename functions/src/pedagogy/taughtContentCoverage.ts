import { createHash } from 'node:crypto';
import { sourceChecksum, type GeneratedAssessmentItem, type ValidatedPreparationSource } from './weeklyAssessmentGenerator';

export const TAUGHT_COVERAGE_POLICY = 'taught-snapshot-review-v1';
type Item = Partial<GeneratedAssessmentItem> & { sourceSnapshotChecksum?: string; taughtPortionIds?: string[] };
const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const portionId = (source: ValidatedPreparationSource) => createHash('sha256').update(JSON.stringify([source.id, source.version, source.teachingConfirmationId, source.pedagogicalContent])).digest('hex');
export function bindTaughtSnapshot(item: Item, sources: ValidatedPreparationSource[]) {
  const selected = sources.filter(source => item.sourceLessonPreparationIds?.includes(source.id));
  return { sourceSnapshotChecksum: sourceChecksum(selected), taughtPortionIds: selected.map(portionId), coveragePolicy: TAUGHT_COVERAGE_POLICY, coverageStatus: 'HUMAN_REVIEW_REQUIRED' };
}
/** Bounded deterministic evidence, NOT a general semantic equivalence classifier.
 * Unknown prose always requires a received human scope decision; it is never auto-approved.
 */
export function taughtContentIssues(item: Item, sources: ValidatedPreparationSource[]): string[] {
  const issues: string[] = [];
  const ids = item.sourceLessonPreparationIds;
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return ['SOURCE_PREPARATIONS_REQUIRED'];
  const selected = sources.filter(source => ids.includes(source.id));
  if (selected.length !== ids.length || selected.some(source => source.subjectId !== item.subjectId || source.classSubjectId !== item.classSubjectId || !source.teachingConfirmationId || !['taught', 'partially_taught'].includes(source.teachingStatus || '') || !source.pedagogicalContent?.trim())) return ['SOURCE_OUTSIDE_TAUGHT_SNAPSHOT'];
  const bound = bindTaughtSnapshot(item, sources);
  if (item.sourceSnapshotChecksum !== bound.sourceSnapshotChecksum || JSON.stringify(item.taughtPortionIds) !== JSON.stringify(bound.taughtPortionIds)) issues.push('TAUGHT_SNAPSHOT_BINDING_MISSING_OR_STALE');
  if ((item.sourceCurriculumUnitIds || []).some(id => !selected.some(source => source.curriculumUnitId === id))) issues.push('CURRICULUM_CANNOT_EXPAND_TAUGHT_CONTENT');
  const sourceText = normalized(selected.map(source => source.pedagogicalContent).join('\n'));
  // Negative restrictions are not affirmative evidence that an operation was taught.
  const affirmative = sourceText.replace(/(?:\bno\b|\bnot\b|\bpas de\b|\bsans\b)[^.\n;]*/g, '');
  const fractionProduct = /\d+\s*\/\s*\d+\s*[×*]\s*\d+\s*\/\s*\d+|(?:multiplication|multiply|multiplying|produit|multiplier)\s+(?:(?:of|de|des|two|deux)\s+)*fractions/;
  const operations = [
    { name: 'FRACTION_PRODUCT', expression: fractionProduct, allowed: fractionProduct },
    { name: 'ADDITION', expression: /\d\s*\+\s*\d|\b(?:addition|add|ajouter)\b/, allowed: /\d\s*\+\s*\d|\b(?:addition|add|ajouter)\b/ },
    { name: 'MULTIPLICATION', expression: /\d\s*[×*]\s*\d|\b(?:multiplication|multiply|multiplying|multiplier|produit)\b/, allowed: /\d\s*[×*]\s*\d|\b(?:multiplication|multiply|multiplying|multiplier|produit|doubling|double|doubler)\b/ },
    { name: 'SUBTRACTION', expression: /\d\s*[-−]\s*\d|\b(?:subtract|subtraction|soustraction|soustraire)\b/, allowed: /\d\s*[-−]\s*\d|\b(?:subtract|subtraction|soustraction|soustraire)\b/ },
    { name: 'DIVISION', expression: /\d\s*÷\s*\d|\b(?:division|divide|diviser)\b/, allowed: /\d\s*÷\s*\d|\b(?:division|divide|diviser)\b/ },
    { name: 'POWER', expression: /\d\s*\^\s*\d|\b(?:power|exponent|puissance|exposant)\b/, allowed: /\d\s*\^\s*\d|\b(?:power|exponent|puissance|exposant)\b/ },
  ];
  const fields = { questionText: item.questionText, instructions: item.instructions, expectedAnswer: item.expectedAnswer, correctionGuide: item.correctionGuide, correctAnswer: item.correctAnswer, choices: item.choices?.join('\n') };
  for (const [field, text] of Object.entries(fields)) {
    for (const operation of operations) if (operation.expression.test(normalized(text || '')) && !operation.allowed.test(affirmative)) issues.push('OUTSIDE_TAUGHT_CONTENT:' + field + ':' + operation.name);
  }
  return issues;
}
