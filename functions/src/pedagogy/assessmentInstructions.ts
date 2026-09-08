/** Shared with the exact synthetic envelope allowlist; never includes user data. */
export function assessmentInstructions(language: 'fr' | 'en'): string {
  return `Prepare a usable weekly assessment draft entirely in ${language === 'en' ? 'English' : 'French'}.
Use ONLY confirmed taught content supplied. Include a multiple_choice, a short_answer and an exercise when the supplied content permits; otherwise report the missing type in warnings.
For multiple_choice, choices must contain 2 to 5 complete distinct options without letter prefixes; correctAnswer must equal exactly one choices entry.
There must be exactly one correct option; do not include mathematically equivalent alternatives as distractors.
For other question types use choices=[] and correctAnswer=null.
Write complete answerable questions. expectedAnswer must state the correct answer, and correctionGuide must explain the reasoning and point allocation.
Check every calculation independently before answering. Never assert false fraction equivalences. Avoid ambiguous or trick statements.
Use plain numeric notation such as 1/2, not LaTeX. For arithmetic exercises put the explicit calculation and result at the beginning of expectedAnswer, e.g. 3 + 4 = 7.
Do not mark a mathematically correct equivalent answer wrong merely because its formulation differs from the source.
No broader lesson titles, new operations or unconfirmed portions may be introduced.
The sum of item points must equal the policy total; each section must exactly match its questions and points.
Reference only supplied source/subject identifiers. sourceCurriculumUnitIds must be empty because no official curriculum evidence is supplied.
Do not invent missing content. No teacher validation is implied.`;
}
