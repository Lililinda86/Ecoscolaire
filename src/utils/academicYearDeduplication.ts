import type { AcademicYear } from '../types';

export function deduplicateAcademicYears(
  years: AcademicYear[],
  schoolId: string | undefined,
  activeAcademicYearId: string | undefined
): AcademicYear[] {
  if (!schoolId) return [];

  const schoolYears = years.filter(y => y.schoolId === schoolId);

  // Étape 1 : supprimer les répétitions strictes du même ID de document
  const uniqueById = new Map<string, AcademicYear>();
  schoolYears.forEach(y => uniqueById.set(y.id, y));

  // Étape 2 : détecter les doublons par bornes (startDate + endDate)
  const byBounds = new Map<string, AcademicYear[]>();
  uniqueById.forEach(y => {
    const key = `${y.startDate}_${y.endDate}`;
    const list = byBounds.get(key) || [];
    list.push(y);
    byBounds.set(key, list);
  });

  const canonicalYears: AcademicYear[] = [];

  byBounds.forEach((list, key) => {
    if (list.length === 1) {
      canonicalYears.push(list[0]);
    } else {
      // Plusieurs IDs pour les mêmes bornes
      const canonical = list.find(y => y.id === activeAcademicYearId) || list.find(y => y.status === 'active') || list[0];
      canonicalYears.push(canonical);

      list.forEach(y => {
        if (y.id !== canonical.id) {
          console.warn(`[WARNING] Duplicate academic year found for bounds: ${key}. Canonical ID: ${canonical.id}, Ignored duplicate ID: ${y.id}`);
        }
      });
    }
  });

  // Étape 3 : Gérer les noms identiques avec dates différentes
  // (La modification du libellé se fera dans le composant au moment de l'affichage)

  // Trier par startDate décroissante
  return canonicalYears.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
}
