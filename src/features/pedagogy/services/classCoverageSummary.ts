import type { CoverageRow } from './curriculumCoverage';

/** Summarize observed configuration, never invent the expected subject total. */
export function classCoverageSummary(rows: CoverageRow[]) {
  const classes = new Map<string, { classId: string; name: string; subjects: Set<string>; adopted: boolean; levelMapped: boolean }>();
  for (const row of rows) {
    const entry = classes.get(row.classId) || { classId: row.classId, name: row.className, subjects: new Set<string>(), adopted: false, levelMapped: false };
    if (row.subject !== 'MATIÈRES / DOMAINES À CONFIGURER') entry.subjects.add(row.subject);
    entry.adopted ||= row.adoptedByITALO;
    entry.levelMapped ||= row.level !== 'LEVEL_NOT_MAPPED';
    classes.set(row.classId, entry);
  }
  return [...classes.values()].map(entry => ({ ...entry, subjects: entry.subjects.size }));
}
