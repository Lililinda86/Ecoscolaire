import { createHash } from 'node:crypto';

export const TEACHING_STATES = ['unconfirmed', 'taught', 'partially_taught', 'postponed', 'not_taught'] as const;
export type TeachingState = typeof TEACHING_STATES[number];
export interface TeachingConfirmation {
  id: string;
  status: TeachingState;
  effectiveDate: string | null;
  declaredByTeacherStaffId: string;
  recordedBy: string;
  recordedAt?: unknown;
  reviewChecksum: string;
  excerpts: string[];
  note: string;
}
export interface ReviewedPreparation {
  status?: string;
  currentUploadId?: string;
  reviewData?: Record<string, unknown> | null;
  teachingConfirmation?: TeachingConfirmation | null;
}
const reviewFields = ['lessonTitle', 'objective', 'prerequisites', 'materials', 'lessonSteps', 'assessment', 'differentiation'] as const;
export function reviewChecksum(preparation: ReviewedPreparation): string {
  return createHash('sha256').update(JSON.stringify({
    uploadId: preparation.currentUploadId || null,
    review: reviewFields.map(field => [field, preparation.reviewData?.[field] || null])
  })).digest('hex');
}
export function reviewedTeachingContent(preparation: ReviewedPreparation): string {
  return ['lessonTitle', 'objective', 'lessonSteps'].map(field => preparation.reviewData?.[field])
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).join('\n');
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}
export function parseTeachingDeclaration(raw: Record<string, unknown>, preparation: ReviewedPreparation, week: { weekStartDate: string; weekEndDate: string }, today: string) {
  const status = raw.status as TeachingState;
  if (!TEACHING_STATES.includes(status)) throw new Error('INVALID_TEACHING_STATUS');
  const taught = status === 'taught' || status === 'partially_taught';
  const effectiveDate = taught ? raw.effectiveDate : null;
  if (taught && (!validDate(effectiveDate) || effectiveDate < week.weekStartDate || effectiveDate > week.weekEndDate || effectiveDate > today)) throw new Error('TEACHING_DATE_OUTSIDE_WEEK_OR_IN_FUTURE');
  if (taught && (preparation.status !== 'validated' || !preparation.currentUploadId || !preparation.reviewData || typeof preparation.reviewData.lessonSteps !== 'string' || !preparation.reviewData.lessonSteps.trim())) throw new Error('RECEIVED_REVIEWED_CONTENT_REQUIRED');
  const excerpts = status === 'partially_taught' ? raw.excerpts : [];
  if (!Array.isArray(excerpts) || excerpts.length > 30 || (status === 'partially_taught' && excerpts.length === 0)) throw new Error('TAUGHT_EXCERPTS_REQUIRED');
  const content = reviewedTeachingContent(preparation);
  if (excerpts.some(excerpt => typeof excerpt !== 'string' || excerpt.trim().length < 3 || excerpt.length > 5000 || !content.includes(excerpt.trim()))) throw new Error('EXCERPT_OUTSIDE_REVIEWED_CONTENT');
  const note = typeof raw.note === 'string' ? raw.note.trim() : '';
  if (note.length > 2000) throw new Error('TEACHING_NOTE_TOO_LONG');
  return { status, effectiveDate: effectiveDate as string | null, excerpts: [...new Set(excerpts.map(excerpt => (excerpt as string).trim()))], note, reviewChecksum: reviewChecksum(preparation) };
}
export function admissibleTeachingContent(preparation: ReviewedPreparation): { content: string; exclusion: string | null } {
  if (preparation.status !== 'validated' || !preparation.currentUploadId || !preparation.reviewData) return { content: '', exclusion: 'preparation_not_received_and_verified' };
  const confirmation = preparation.teachingConfirmation;
  if (!confirmation || !['taught', 'partially_taught'].includes(confirmation.status)) return { content: '', exclusion: 'teaching_not_confirmed' };
  if (confirmation.reviewChecksum !== reviewChecksum(preparation)) return { content: '', exclusion: 'confirmation_refers_to_previous_review' };
  const content = reviewedTeachingContent(preparation);
  if (confirmation.status === 'partially_taught') {
    if (!confirmation.excerpts.length || confirmation.excerpts.some(excerpt => !content.includes(excerpt))) return { content: '', exclusion: 'invalid_taught_excerpts' };
    return { content: confirmation.excerpts.join('\n'), exclusion: null };
  }
  return content.trim() ? { content, exclusion: null } : { content: '', exclusion: 'insufficient_reviewed_content' };
}
