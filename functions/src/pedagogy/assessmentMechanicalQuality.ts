import type { GeneratedAssessmentItem } from './weeklyAssessmentGenerator';

export function plainAssessmentMath(text: string): string {
  return text.replace(/\\+frac\s*\{\s*(-?\d+)\s*\}\s*\{\s*(-?\d+)\s*\}/g, '$1/$2')
    .replace(/\\+[()[\]]/g, '').trim();
}

/** Narrow mechanical checks, not a substitute for pedagogical or mathematical review. */
export function assessmentMechanicalIssues(items: Pick<GeneratedAssessmentItem, 'order' | 'questionType' | 'questionText' | 'instructions' | 'expectedAnswer'>[]): string[] {
  const issues: string[] = [];
  for (const item of items) {
    if (item.questionType === 'multiple_choice') {
      const visible = item.questionText + '\n' + item.instructions;
      const labels = [...visible.matchAll(/(?:^|\s)([A-Da-d1-9])[).:]\s+\S/g)].map(match => match[1].toUpperCase());
      if (new Set(labels).size < 2) issues.push('MCQ_CHOICES_MISSING:' + item.order);
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
