import type { ClassSection } from '../types';

export const sortClasses = (classes: ClassSection[]): ClassSection[] => {
  const fOrder = ['pré-maternelle', 'maternelle 1', 'petite section', 'maternelle 2', 'moyenne section', 'maternelle 3', 'grande section', 'sil', 'cp', 'ce1', 'ce2', 'cm1', 'cm2', '6e', '5e'];
  const aOrder = ['pre-nursery', 'nursery 1', 'nursery 2', 'nursery 3', 'class 1', 'class 2', 'class 3', 'class 4', 'class 5', 'class 6', 'form 1', 'form 2'];

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
