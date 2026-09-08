/** Render the provider's simple numeric fraction notation as plain text, never HTML. */
export function readableAssessmentText(value: string): string {
  return value.replace(/\\+frac\s*\{\s*(-?\d+|\\+_)\s*\}\s*\{\s*(-?\d+|\\+_)\s*\}/g, '$1/$2')
    .replace(/\\+_/g, '___').replace(/\\+[()[\]]/g, '').trim();
}
