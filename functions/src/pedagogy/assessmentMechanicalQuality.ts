import type { GeneratedAssessmentItem } from './weeklyAssessmentGenerator';

type Rational = { numerator: bigint; denominator: bigint };
function numericValue(text: string): Rational | null {
  const fraction = text.trim().match(/^(-?\d{1,9})\s*\/\s*(-?\d{1,9})$/);
  if (fraction) return BigInt(fraction[2]) === 0n ? null : { numerator: BigInt(fraction[1]), denominator: BigInt(fraction[2]) };
  const decimal = text.trim().match(/^(-?\d{1,9})(?:[.,](\d{1,6}))?$/);
  if (!decimal) return null;
  const scale = 10n ** BigInt((decimal[2] || '').length);
  return { numerator: BigInt(decimal[1]) * scale + BigInt((decimal[1].startsWith('-') ? '-' : '') + (decimal[2] || '0')), denominator: scale };
}
const equalNumbers = (a: Rational, b: Rational) => a.numerator * b.denominator === b.numerator * a.denominator;

/** Bounded literal arithmetic only: no eval, language inference or semantic certification. */
export function assertedArithmeticIssue(text: string): boolean {
  const number = String.raw`(-?\d{1,9}(?:[.,]\d{1,6})?(?:\s*\/\s*-?\d{1,9})?)`;
  const match = plainAssessmentMath(text).match(new RegExp('^' + number + '\\s*([+−*×÷-])\\s*' + number + '\\s*=\\s*' + number + '(?=\\s|[;,.]|$)'));
  if (!match) return false;
  const a = numericValue(match[1]), b = numericValue(match[3]), actual = numericValue(match[4]);
  if (!a || !b || !actual) return true;
  const operator = match[2];
  let expected: Rational;
  if (operator === '+' || operator === '-' || operator === '−') expected = { numerator: a.numerator * b.denominator + (operator === '+' ? 1n : -1n) * b.numerator * a.denominator, denominator: a.denominator * b.denominator };
  else if (operator === '÷') {
    if (b.numerator === 0n) return true;
    expected = { numerator: a.numerator * b.denominator, denominator: a.denominator * b.numerator };
  } else expected = { numerator: a.numerator * b.numerator, denominator: a.denominator * b.denominator };
  return !equalNumbers(expected, actual);
}

export function plainAssessmentMath(text: string): string {
  return text.replace(/\\+frac\s*\{\s*(-?\d+)\s*\}\s*\{\s*(-?\d+)\s*\}/g, '$1/$2')
    .replace(/\\+[()[\]]/g, '').trim();
}

/** Narrow mechanical checks, not a substitute for pedagogical or mathematical review. */
export function assessmentMechanicalIssues(items: Pick<GeneratedAssessmentItem, 'order' | 'questionType' | 'questionText' | 'instructions' | 'expectedAnswer' | 'choices' | 'correctAnswer'>[]): string[] {
  const issues: string[] = [];
  for (const item of items) {
    if (assertedArithmeticIssue(item.expectedAnswer)) issues.push('ARITHMETIC_RESULT_INVALID:' + item.order);
    if (item.questionType === 'multiple_choice') {
      const visible = item.questionText + '\n' + item.instructions;
      const labels = [...visible.matchAll(/(?:^|\s)([A-Da-d1-9])[).:]\s+\S/g)].map(match => match[1].toUpperCase());
      if (item.choices !== undefined) {
        const choices = item.choices;
        if (!Array.isArray(choices) || choices.length < 2 || choices.length > 5 || choices.some(choice => typeof choice !== 'string' || !choice.trim() || choice.length > 1000)) issues.push('MCQ_CHOICES_MISSING:' + item.order);
        else {
          const normalized = choices.map(choice => choice.trim().normalize('NFKC').toLocaleLowerCase());
          if (new Set(normalized).size !== choices.length) issues.push('MCQ_CHOICES_DUPLICATED:' + item.order);
          if (typeof item.correctAnswer !== 'string' || choices.filter(choice => choice === item.correctAnswer).length !== 1) issues.push('MCQ_ANSWER_NOT_IN_CHOICES:' + item.order);
          const numeric = choices.map(numericValue);
          const correct = numericValue(item.correctAnswer || '');
          const answerText = plainAssessmentMath(item.expectedAnswer);
          const assertedResult = answerText.includes('=') ? answerText.split('=').at(-1)!.split(';')[0].trim() : answerText;
          const numericExpected = numericValue(assertedResult);
          if (correct && numericExpected && !equalNumbers(correct, numericExpected)) issues.push('MCQ_EXPECTED_ANSWER_CONFLICT:' + item.order);
          if (correct && numeric.filter(value => value && equalNumbers(value, correct)).length > 1) issues.push('MCQ_EQUIVALENT_CORRECT_CHOICES:' + item.order);
        }
      } else if (new Set(labels).size < 2) issues.push('MCQ_CHOICES_MISSING:' + item.order);
    }
    // Only an explicitly asserted leading integer-fraction equality is checked.
    // Do not reinterpret a false statement in a question as its expected answer.
    const match = plainAssessmentMath(item.expectedAnswer).match(/^(-?\d{1,9})\s*\/\s*(-?\d{1,9})\s*=\s*(-?\d{1,9})\s*\/\s*(-?\d{1,9})(?=\s|[;,.]|$)/);
    if (match) {
      const [, a, b, c, d] = match.map(Number);
      if (!b || !d || BigInt(a) * BigInt(d) !== BigInt(c) * BigInt(b)) issues.push('FRACTION_EQUALITY_INVALID:' + item.order);
    }
  }
  return issues;
}
