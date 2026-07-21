import type { ClassSection } from '../types';
import { resolveEducationType } from './classCatalog';

export const sortClasses = (
  classes: ClassSection[],
  resolvedSpecialtyNames?: Record<string, string>
): ClassSection[] => {
  const fOrder = [
    'pré-maternelle', 'pre-maternelle',
    'petite section', 'maternelle 1',
    'moyenne section', 'maternelle 2',
    'grande section', 'maternelle 3',
    'sil', 'cp', 'ce1', 'ce2', 'cm1', 'cm2',
    '6e', '6ème', '5e', '5ème', '4e', '4ème', '3e', '3ème', '2nde', 'seconde', '1re', 'première', 'terminale'
  ];

  const aOrder = [
    'pre-nursery',
    'nursery 1', 'nursery 2', 'nursery 3',
    'class 1', 'class 2', 'class 3', 'class 4', 'class 5', 'class 6',
    'form 1', 'form 2', 'form 3', 'form 4', 'form 5', 'lower sixth', 'upper sixth'
  ];

  const getEduRank = (c: ClassSection): number => {
    const res = resolveEducationType(c.educationType, c.specialtyId);
    if (res.value === 'general') return 1;
    if (res.value === 'technical') return 2;
    return 3; // unknown / anomaly
  };

  const getSpecName = (c: ClassSection): string => {
    if (resolvedSpecialtyNames && c.specialtyId && resolvedSpecialtyNames[c.specialtyId]) {
      return resolvedSpecialtyNames[c.specialtyId];
    }
    return c.specialtyId || '';
  };

  return [...classes].sort((a, b) => {
    // 1. Si levelOrder est présent sur les deux éléments, on l'utilise
    if (a.levelOrder !== undefined && b.levelOrder !== undefined) {
      if (a.levelOrder !== b.levelOrder) return a.levelOrder - b.levelOrder;

      const aRank = getEduRank(a);
      const bRank = getEduRank(b);
      if (aRank !== bRank) return aRank - bRank;

      return getSpecName(a).localeCompare(getSpecName(b));
    }

    // 2. Différencier francophone (-1) et anglophone (1)
    const aType = a.type || a.section || 'francophone';
    const bType = b.type || b.section || 'francophone';
    if (aType !== bType) return aType === 'francophone' ? -1 : 1;

    const orderArray = aType === 'francophone' ? fOrder : aOrder;
    
    // Normalize string to match exactly
    const normalize = (str: string) => str.toLowerCase().trim();
    const aName = normalize(a.name);
    const bName = normalize(b.name);

    const aIndex = orderArray.indexOf(aName);
    const bIndex = orderArray.indexOf(bName);

    if (aIndex !== -1 && bIndex !== -1) {
      if (aIndex !== bIndex) return aIndex - bIndex;

      // 3. À niveau identique : general (1) -> technical (2) -> unknown (3)
      const aRank = getEduRank(a);
      const bRank = getEduRank(b);
      if (aRank !== bRank) return aRank - bRank;

      // 4. Si deux classes du même type : spécialité par ordre alphabétique du nom résolu
      return getSpecName(a).localeCompare(getSpecName(b));
    }
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    // Fallback alphabétique
    return a.name.localeCompare(b.name);
  });
};
