import { expect, it } from 'vitest';
import { assessmentMechanicalIssues, plainAssessmentMath } from '../../functions/src/pedagogy/assessmentMechanicalQuality';
const item = { order: 1, questionType: 'exercise' as const, questionText: 'Synthetic fraction question', instructions: 'Explain.', expectedAnswer: '2/6 = 2/3 ; synthetic incorrect answer' };
it('rejects the false fraction equality observed in the actual synthetic provider response', () => {
  expect(assessmentMechanicalIssues([item])).toEqual(['FRACTION_EQUALITY_INVALID:1']);
  expect(assessmentMechanicalIssues([{ ...item, expectedAnswer: '\\( \\frac{2}{6} = \\frac{2}{3} \\) ; synthetic answer' }])).toEqual(['FRACTION_EQUALITY_INVALID:1']);
});
it('accepts equivalent fractions but makes no general correctness claim', () => {
  expect(assessmentMechanicalIssues([{ ...item, expectedAnswer: '2/6 = 1/3' }])).toEqual([]);
  expect(assessmentMechanicalIssues([{ ...item, expectedAnswer: 'False: 2/6 = 2/3 is incorrect.' }])).toEqual([]);
  expect(assessmentMechanicalIssues([{ ...item, expectedAnswer: '1/0 = 2/0' }])).toEqual(['FRACTION_EQUALITY_INVALID:1']);
  expect(plainAssessmentMath('\\( \\frac{1}{2} \\)')).toBe('1/2');
});
it('refuses a QCM without at least two labelled visible choices', () => {
  expect(assessmentMechanicalIssues([{ ...item, questionType: 'multiple_choice', questionText: 'Which fraction equals one half?', expectedAnswer: '2/4' }])).toEqual(['MCQ_CHOICES_MISSING:1']);
  expect(assessmentMechanicalIssues([{ ...item, questionType: 'multiple_choice', questionText: 'Which fraction equals one half? A) 2/4 B) 1/4', expectedAnswer: 'A' }])).toEqual([]);
});
