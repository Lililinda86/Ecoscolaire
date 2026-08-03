import { createHash } from 'node:crypto';

export interface DraftSubjectInput {
  id: string;
  subjectId: string;
  subjectNameSnapshot: string;
  subjectCodeSnapshot?: string;
  coefficient?: number;
  weeklyHours?: number;
  isRequired: boolean;
  displayOrder: number;
  isActive: boolean;
  revisionId: string;
  revisionNumber: number;
}

export function canonicalizeDraftState(subjects: DraftSubjectInput[]): string {
  // Sort by document ID to ensure determinism
  const sorted = [...subjects].sort((a, b) => a.id.localeCompare(b.id));

  // Map to stable object structure
  const normalized = sorted.map((s) => {
    // Explicit, fixed ordering of keys in the resulting JSON
    const obj: Record<string, unknown> = {};
    obj.id = s.id;
    obj.subjectId = s.subjectId;
    obj.subjectNameSnapshot = s.subjectNameSnapshot;

    if (s.subjectCodeSnapshot !== undefined && s.subjectCodeSnapshot !== null) {
      obj.subjectCodeSnapshot = s.subjectCodeSnapshot;
    }
    if (s.coefficient !== undefined && s.coefficient !== null) {
      obj.coefficient = Number(s.coefficient);
    }
    if (s.weeklyHours !== undefined && s.weeklyHours !== null) {
      obj.weeklyHours = Number(s.weeklyHours);
    }

    obj.isRequired = !!s.isRequired;
    obj.displayOrder = Number(s.displayOrder);
    obj.isActive = !!s.isActive;
    obj.revisionId = s.revisionId;
    obj.revisionNumber = Number(s.revisionNumber);

    return obj;
  });

  return JSON.stringify(normalized);
}

export function computeDraftStateToken(subjects: DraftSubjectInput[]): string {
  const canonicalState = canonicalizeDraftState(subjects);
  return createHash('sha256')
    .update(canonicalState, 'utf8')
    .digest('hex')
    .toLowerCase();
}
