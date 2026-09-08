type Row = { id: string; [key: string]: unknown };
export interface ObservationScope { schoolId: string; academicYearId: string; classId: string; studentId: string }
export interface ObjectiveEvidence { key: string; subjectId: string; objective: string; latestDate: string; states: string[]; currentObservationCount: number; latestObservationIds: string[]; conflicting: boolean }

/** Exact objective text only: no semantic equivalence or curriculum mastery inference. */
export function summarizeObjectiveEvidence(rows: Row[], scope: ObservationScope): ObjectiveEvidence[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    if (Object.entries(scope).some(([key, value]) => row[key] !== value) || row.supersededBy ||
      typeof row.objective !== 'string' || !row.objective.trim() || typeof row.subjectId !== 'string' || !row.subjectId ||
      typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      !['not_observed', 'discovering', 'developing', 'acquired'].includes(String(row.state))) continue;
    const parsed = new Date(row.date + 'T00:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== row.date) continue;
    const key = JSON.stringify([row.subjectId, row.objective]);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.entries()].map(([key, observations]) => {
    const latestDate = observations.map(row => String(row.date)).sort().at(-1)!;
    const latest = observations.filter(row => row.date === latestDate);
    const states = [...new Set(latest.map(row => String(row.state)))].sort();
    return { key, subjectId: String(latest[0].subjectId), objective: String(latest[0].objective), latestDate, states,
      currentObservationCount: observations.length, latestObservationIds: latest.map(row => row.id).sort(), conflicting: states.length > 1 };
  }).sort((a, b) => a.subjectId.localeCompare(b.subjectId) || a.objective.localeCompare(b.objective));
}
