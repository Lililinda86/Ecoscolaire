import type { ClassSection } from '../types';

export const sortClasses = (classes: ClassSection[]): ClassSection[] => {
  const fOrder = ['maternelle 1', 'maternelle 2', 'maternelle 3', 'sil', 'cp', 'ce1', 'ce2', 'cm1', 'cm2'];
  const aOrder = ['nursery 1', 'nursery 2', 'nursery 3', 'class 1', 'class 2', 'class 3', 'class 4', 'class 5', 'class 6'];

  return [...classes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'francophone' ? -1 : 1;

    const orderArray = a.type === 'francophone' ? fOrder : aOrder;
    
    // Normalize string to match exactly
    const normalize = (str: string) => str.toLowerCase().trim().replace(/m[èe]re/gi, 'maternelle');
    const aName = normalize(a.name);
    const bName = normalize(b.name);

    const aIndex = orderArray.indexOf(aName);
    const bIndex = orderArray.indexOf(bName);

    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    // Known classes come first before custom unknown ones
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    // Fallback alphabetic
    return a.name.localeCompare(b.name);
  });
};
