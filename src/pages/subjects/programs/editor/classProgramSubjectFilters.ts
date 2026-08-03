import type { Subject, ClassSubject } from '../../../../types';
import type { NormalizedSection, NormalizedCycle } from '../../../../utils/classClassification';

export function filterAvailableSubjectsForClass(params: {
  catalogSubjects: Subject[];
  activeSubjects: ClassSubject[];
  schoolId: string;
  classSection: NormalizedSection;
  classCycle: NormalizedCycle;
  isFiltered: boolean;
  searchTerm: string;
}): Subject[] {
  const { catalogSubjects, activeSubjects, schoolId, classSection, classCycle, isFiltered, searchTerm } = params;
  return catalogSubjects.filter(s => {
    const isSchoolMatch = s.schoolId === schoolId || !s.schoolId;
    const isActive = s.isActive !== false;
    const isAlreadyAdded = activeSubjects.some(as => as.subjectId === s.id && as.isActive);

    if (!isSchoolMatch || !isActive || isAlreadyAdded) return false;

    // Apply smart filter by section and cycle
    if (isFiltered) {
      // Metadonnée legacy incomplète non classifiable (exclue des recommandations)
      // On considère que s.section === 'all' ou absent/vide est "commun" uniquement si explicitement défini
      const hasSectionMeta = !!s.section && s.section !== 'all';
      const hasCycleMeta = !!s.cycles && s.cycles.length > 0;
      
      // convention: section === 'all' ou cycles vide/non défini (length === 0)
      const isCommonSection = s.section === 'all';
      const isCommonCycle = !s.cycles || s.cycles.length === 0;

      if (!hasSectionMeta && !hasCycleMeta) {
        // Politique legacy finale stricte: sans métadonnées structurées, la matière est non classifiable
        // et n'apparaît que si le filtre est désactivé.
        return false;
      }

      const matchesSection = isCommonSection || !s.section || s.section === classSection;

      // s.cycles can be nursery/primary/secondary. Class cycles are maternelle/primaire/secondaire. Map them.
      const mappedCycles = (s.cycles || []).map(c => {
        if (c === 'nursery') return 'maternelle';
        if (c === 'primary') return 'primaire';
        if (c === 'secondary') return 'secondaire';
        return c;
      });
      const matchesCycle = isCommonCycle || (classCycle !== 'unknown' && mappedCycles.includes(classCycle));

      if (!matchesSection || !matchesCycle) return false;
    }

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (s.name || '').toLowerCase().includes(term) ||
      (s.code || '').toLowerCase().includes(term)
    );
  });
}
