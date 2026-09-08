import { expect, it } from 'vitest';
import { flagIncompleteAiExtraction, type PreparationAnalysisResult } from '../../functions/src/pedagogy/preparationAnalyzer';
const extracted: PreparationAnalysisResult = {
  schemaVersion: 'preparation-analysis-v1', lessonTitle: null, subjectName: 'English',
  objective: 'Hear the initial /m/ sound.', prerequisites: [], materials: ['picture cards'],
  lessonSteps: [{ title: 'Listen to moon and mouse.', durationMinutes: 4, description: null }],
  assessment: 'Observe without numerical marks.', differentiation: null, warnings: [], confidence: 0.95,
};
it('flags a missing title even with high model confidence without inventing it', () => {
  const result = flagIncompleteAiExtraction(extracted);
  expect(result.lessonTitle).toBeNull();
  expect(result.warnings.join(' ')).toContain('lessonTitle');
  expect(result.objective).toBe(extracted.objective);
  expect(extracted.warnings).toEqual([]);
});
it('keeps warning bounds and preserves complete extracts', () => {
  expect(flagIncompleteAiExtraction({ ...extracted, warnings: Array(30).fill('Draft') }).warnings).toHaveLength(30);
  const complete = { ...extracted, lessonTitle: 'Listening to initial sounds' };
  expect(flagIncompleteAiExtraction(complete)).toBe(complete);
});
