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

export function computeDraftStateToken(subjects: DraftSubjectInput[]): string {
  // Sort by document ID to ensure determinism
  const sorted = [...subjects].sort((a, b) => a.id.localeCompare(b.id));

  // Map to stable object structure
  const normalized = sorted.map((s) => {
    const obj: Record<string, unknown> = {
      id: s.id,
      subjectId: s.subjectId,
      subjectNameSnapshot: s.subjectNameSnapshot,
      isRequired: !!s.isRequired,
      displayOrder: Number(s.displayOrder),
      isActive: !!s.isActive,
      revisionId: s.revisionId,
      revisionNumber: Number(s.revisionNumber),
    };

    if (s.subjectCodeSnapshot !== undefined && s.subjectCodeSnapshot !== null) {
      obj.subjectCodeSnapshot = s.subjectCodeSnapshot;
    }
    if (s.coefficient !== undefined && s.coefficient !== null) {
      obj.coefficient = Number(s.coefficient);
    }
    if (s.weeklyHours !== undefined && s.weeklyHours !== null) {
      obj.weeklyHours = Number(s.weeklyHours);
    }

    return obj;
  });

  const jsonStr = JSON.stringify(normalized);

  // Simple deterministic hash (FNV-1a 32-bit)
  let hash = 2166136261;
  for (let i = 0; i < jsonStr.length; i++) {
    hash ^= jsonStr.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}
