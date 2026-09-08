import { expect, it } from 'vitest';
import { assessmentMechanicalIssues, assertedArithmeticIssue } from '../../functions/src/pedagogy/assessmentMechanicalQuality';
import { assessmentAiSchema } from '../../functions/src/pedagogy/aiAssessment';
const item = { order: 1, questionType: 'multiple_choice' as const, questionText: '3 + 4 = ?', instructions: 'Choisis.', expectedAnswer: '3 + 4 = 7', choices: ['5', '7', '9'], correctAnswer: '7' };
it('requires structured choices and exact answer in the provider schema', () => {
  const schema = assessmentAiSchema.properties.items.items;
  expect(schema.required).toContain('choices');
  expect(schema.required).toContain('correctAnswer');
});
it('validates structured QCMs and rejects missing, duplicate or equivalent answers', () => {
  expect(assessmentMechanicalIssues([item])).toEqual([]);
  expect(assessmentMechanicalIssues([{ ...item, choices: [] }])).toContain('MCQ_CHOICES_MISSING:1');
  expect(assessmentMechanicalIssues([{ ...item, correctAnswer: 'A' }])).toContain('MCQ_ANSWER_NOT_IN_CHOICES:1');
  expect(assessmentMechanicalIssues([{ ...item, correctAnswer: '5' }])).toContain('MCQ_EXPECTED_ANSWER_CONFLICT:1');
  expect(assessmentMechanicalIssues([{ ...item, choices: ['7', ' 7 '] }])).toContain('MCQ_CHOICES_DUPLICATED:1');
  expect(assessmentMechanicalIssues([{ ...item, choices: ['1/2', '2/4'], correctAnswer: '1/2' }])).toContain('MCQ_EQUIVALENT_CORRECT_CHOICES:1');
});
it('recalculates bounded asserted arithmetic exactly, without evaluating code', () => {
  for (const answer of ['3 + 4 = 7', '0.1 + 0.2 = 0.3', '-2 × 4 = -8', '1/2 + 1/4 = 3/4', '12 ÷ 3 = 4']) expect(assertedArithmeticIssue(answer)).toBe(false);
  for (const answer of ['3 + 4 = 8', '0.1 + 0.2 = 0.4', '1/2 + 1/4 = 2/6', '1 ÷ 0 = 0']) expect(assertedArithmeticIssue(answer)).toBe(true);
  expect(assertedArithmeticIssue('False: 3 + 4 = 8')).toBe(false);
  expect(assertedArithmeticIssue('process.exit()')).toBe(false);
});
