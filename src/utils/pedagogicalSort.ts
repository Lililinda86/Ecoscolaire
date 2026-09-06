import { normalizeFrancophoneMaternelleLevel } from './classCatalog';

export function cleanClassName(name: string, section: string): string {
  if (!name || !section || section === 'unknown' || section === 'all') return name;
  const regex = new RegExp(section + '$', 'i');
  return name.replace(regex, '').trim();
}

export function getPedagogicalClassRank(className: string, section: string): number {
  const cleanedName = cleanClassName(className, section);
  const normName = cleanedName.toLowerCase().replace(/[-éèê]/g, 'e').replace(/\s+/g, '');
  const normSection = section.toLowerCase();
  
  if (normSection === 'francophone' || normSection === 'all') {
    if (normName.includes('prematernelle')) return 1;
    const maternelleLevel = normalizeFrancophoneMaternelleLevel(cleanedName);
    if (maternelleLevel === 'fr-preschool-ps') return 2;
    if (maternelleLevel === 'fr-preschool-ms') return 3;
    if (maternelleLevel === 'fr-preschool-gs') return 4;
    if (normName.includes('sil')) return 5;
    if (normName.includes('cp')) return 6;
    if (normName.includes('ce1')) return 7;
    if (normName.includes('ce2')) return 8;
    if (normName.includes('cm1')) return 9;
    if (normName.includes('cm2')) return 10;
    if (normName.includes('6e') || normName.includes('sixieme')) return 11;
    if (normName.includes('5e') || normName.includes('cinquieme')) return 12;
    if (normName.includes('4e') || normName.includes('quatrieme')) return 13;
    if (normName.includes('3e') || normName.includes('troisieme')) return 14;
    if (normName.includes('2nde') || normName.includes('seconde')) return 15;
    if (normName.includes('1re') || normName.includes('premiere')) return 16;
    if (normName.includes('terminale')) return 17;
  }
  
  if (normSection === 'anglophone' || normSection === 'all') {
    if (normName.includes('prenursery')) return 1;
    if (normName.includes('nursery1')) return 2;
    if (normName.includes('nursery2')) return 3;
    if (normName.includes('nursery3')) return 4;
    if (normName.includes('class1')) return 5;
    if (normName.includes('class2')) return 6;
    if (normName.includes('class3')) return 7;
    if (normName.includes('class4')) return 8;
    if (normName.includes('class5')) return 9;
    if (normName.includes('class6')) return 10;
    if (normName.includes('form1')) return 11;
    if (normName.includes('form2')) return 12;
    if (normName.includes('form3')) return 13;
    if (normName.includes('form4')) return 14;
    if (normName.includes('form5')) return 15;
    if (normName.includes('lowersixth')) return 16;
    if (normName.includes('uppersixth')) return 17;
  }
  
  return 999;
}

export function sortClassesPedagogically<T extends { name: string, section?: string, cycle?: string }>(
  classes: T[],
  currentSection?: string
): T[] {
  return [...classes].sort((a, b) => {
    const sectionA = (a.section || '').toLowerCase();
    const sectionB = (b.section || '').toLowerCase();
    const currentSec = (currentSection || '').toLowerCase();
    
    // 1. section de la classe actuellement ouverte
    if (currentSec) {
      if (sectionA === currentSec && sectionB !== currentSec) return -1;
      if (sectionB === currentSec && sectionA !== currentSec) return 1;
    }
    
    // 2. autres sections (géré implicitement après la currentSection)
    if (sectionA !== sectionB) {
      return sectionA.localeCompare(sectionB);
    }
    
    // 3. cycle (maternelle > primaire > secondaire)
    const cycleOrder: Record<string, number> = {
      'maternelle': 1,
      'primaire': 2,
      'secondaire': 3
    };
    const cA = cycleOrder[(a.cycle || '').toLowerCase()] || 99;
    const cB = cycleOrder[(b.cycle || '').toLowerCase()] || 99;
    if (cA !== cB) return cA - cB;
    
    // 4. rang pédagogique
    const rankA = getPedagogicalClassRank(a.name, a.section || '');
    const rankB = getPedagogicalClassRank(b.name, b.section || '');
    if (rankA !== rankB) return rankA - rankB;
    
    // 5. nom avec localeCompare
    const cleanA = cleanClassName(a.name, a.section || '');
    const cleanB = cleanClassName(b.name, b.section || '');
    return cleanA.localeCompare(cleanB, 'fr');
  });
}
