import type { AcademicYear } from '../types';

function normalizeName(name?: string): string {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function isValidIsoDate(dateStr?: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const d = new Date(dateStr);
  return d.toISOString().startsWith(dateStr);
}

function normalizeDate(dateStr?: string): string | undefined {
  return isValidIsoDate(dateStr) ? dateStr : undefined;
}

function groupAcademicYears(schoolYears: AcademicYear[]): AcademicYear[][] {
  const uniqueById = new Map<string, AcademicYear>();
  schoolYears.forEach(y => uniqueById.set(y.id, y));
  const uniqueYears = Array.from(uniqueById.values());

  const completeGroups = new Map<string, AcademicYear[]>();
  const incompleteYears: AcademicYear[] = [];

  uniqueYears.forEach(y => {
    const start = normalizeDate(y.startDate);
    const end = normalizeDate(y.endDate);
    if (start && end) {
      const key = `${start}_${end}`;
      if (!completeGroups.has(key)) completeGroups.set(key, []);
      completeGroups.get(key)!.push(y);
    } else {
      incompleteYears.push(y);
    }
  });

  const finalGroups: AcademicYear[][] = Array.from(completeGroups.values());

  incompleteYears.forEach(inc => {
    const start = normalizeDate(inc.startDate);
    const end = normalizeDate(inc.endDate);
    const nameNorm = normalizeName(inc.name);

    const compatibleGroups = finalGroups.filter(g => {
      const g0 = g[0];
      if (normalizeName(g0.name) !== nameNorm) return false;
      const gStart = normalizeDate(g0.startDate);
      const gEnd = normalizeDate(g0.endDate);
      if (start && start !== gStart) return false;
      if (end && end !== gEnd) return false;
      return true;
    });

    if (compatibleGroups.length === 1) {
      compatibleGroups[0].push(inc);
    } else if (compatibleGroups.length === 0) {
      const existingIncompleteGroup = finalGroups.find(g => {
        const g0 = g[0];
        const g0Start = normalizeDate(g0.startDate);
        const g0End = normalizeDate(g0.endDate);
        if (g0Start && g0End) return false;
        return normalizeName(g0.name) === nameNorm;
      });
      if (existingIncompleteGroup) {
        existingIncompleteGroup.push(inc);
      } else {
        finalGroups.push([inc]);
      }
    } else {
      // Ambiguous incomplete
      console.warn(`[WARNING] Ambiguous incomplete academic year ${inc.id}. Matches multiple complete groups.`);
      finalGroups.push([inc]);
    }
  });

  return finalGroups;
}

export function deduplicateAcademicYears(
  years: AcademicYear[],
  schoolId: string | undefined,
  activeAcademicYearId: string | undefined
): AcademicYear[] {
  if (!schoolId) return [];

  const schoolYears = years.filter(y => y.schoolId === schoolId);
  const groups = groupAcademicYears(schoolYears);

  const canonicalYears: AcademicYear[] = [];

  groups.forEach(list => {
    if (list.length === 1) {
      canonicalYears.push(list[0]);
    } else {
      const canonical = list.find(y => y.id === activeAcademicYearId) || list.find(y => y.status === 'active') || list[0];
      canonicalYears.push(canonical);

      list.forEach(y => {
        if (y.id !== canonical.id) {
          console.warn(`[WARNING] Duplicate academic year found. Canonical ID: ${canonical.id}, Ignored duplicate ID: ${y.id}`);
        }
      });
    }
  });

  return canonicalYears.sort((a, b) => {
    const dateA = normalizeDate(a.startDate) || '';
    const dateB = normalizeDate(b.startDate) || '';
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return normalizeName(a.name).localeCompare(normalizeName(b.name));
  });
}

export function getEquivalentAcademicYearIds(
  academicYears: AcademicYear[],
  schoolId: string | undefined,
  selectedAcademicYearId: string | undefined
): string[] {
  if (!schoolId || !selectedAcademicYearId) return [];

  const schoolYears = academicYears.filter(y => y.schoolId === schoolId);
  const groups = groupAcademicYears(schoolYears);

  const targetGroup = groups.find(g => g.some(y => y.id === selectedAcademicYearId));
  if (!targetGroup) return [];
  return targetGroup.map(y => y.id);
}
