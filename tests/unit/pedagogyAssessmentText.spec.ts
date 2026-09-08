import { expect, it } from 'vitest';
import { readableAssessmentText } from '../../src/features/pedagogy/services/assessmentText';
it('renders simple provider fraction notation without changing its arithmetic', () => {
  expect(readableAssessmentText('\\( \\frac{1}{2} = \\frac{2}{4} \\)')).toBe('1/2 = 2/4');
  expect(readableAssessmentText('\\( \\frac{2}{6} = \\frac{2}{3} \\)')).toBe('2/6 = 2/3');
  expect(readableAssessmentText('\\frac{\\_}{8}')).toBe('___/8');
  expect(readableAssessmentText('Write 3 + 4.')).toBe('Write 3 + 4.');
});
