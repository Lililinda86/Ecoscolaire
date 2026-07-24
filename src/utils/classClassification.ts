import type { ClassSection, TechnicalSpecialty } from '../types';
import { resolveEducationType } from './classCatalog';

export type NormalizedSection = 'francophone' | 'anglophone' | 'unknown';
export type NormalizedCycle = 'maternelle' | 'primaire' | 'secondaire' | 'unknown';

export interface ClassGroupDescriptor {
  section: NormalizedSection;
  cycle: NormalizedCycle;
  teachingType: 'general' | 'technical' | 'unknown';
  specialtyName: string;
  label: string;
  key: string;
}

export function normalizeClassSection(cls: Partial<ClassSection>): NormalizedSection {
  const sectionVal = cls.type || cls.section;
  if (!sectionVal) return 'unknown';
  const clean = sectionVal.toLowerCase().trim();
  if (clean === 'francophone') return 'francophone';
  if (clean === 'anglophone') return 'anglophone';
  return 'unknown';
}

export function normalizeClassCycle(cls: Partial<ClassSection>): NormalizedCycle {
  // 1. Check cycle
  if (cls.cycle) {
    const c = cls.cycle.toLowerCase().trim();
    if (c === 'preschool' || c === 'nursery' || c === 'maternelle' || c === 'pre-nursery' || c === 'pre_nursery') {
      return 'maternelle';
    }
    if (c === 'primary' || c === 'primaire') {
      return 'primaire';
    }
    if (c === 'secondary' || c === 'secondaire') {
      return 'secondaire';
    }
  }

  // 2. Check level
  if (cls.level) {
    const l = cls.level.toLowerCase().trim();
    if (l === 'preschool' || l === 'nursery' || l === 'maternelle' || l === 'pre-nursery' || l === 'pre_nursery') {
      return 'maternelle';
    }
    if (l === 'primary' || l === 'primaire') {
      return 'primaire';
    }
    if (l === 'secondary' || l === 'secondaire') {
      return 'secondaire';
    }
  }

  // 3. Fallback by name analysis (only if cycle and level are not recognized)
  if (!cls.name) return 'unknown';
  const n = cls.name.toLowerCase().trim();
  if (
    n.includes('maternelle') ||
    n.includes('nursery') ||
    n.includes('pré-') ||
    n.includes('petite section') ||
    n.includes('moyenne section') ||
    n.includes('grande section') ||
    n.includes('pre-maternelle') ||
    n.includes('pre-nursery') ||
    n.includes('pre_nursery')
  ) {
    return 'maternelle';
  }
  if (
    n.startsWith('class ') ||
    n === 'sil' ||
    n === 'cp' ||
    n === 'ce1' ||
    n === 'ce2' ||
    n === 'cm1' ||
    n === 'cm2' ||
    n.includes('primary') ||
    n.includes('primaire')
  ) {
    return 'primaire';
  }
  if (
    n.startsWith('form ') ||
    n.includes('sixth') ||
    n.includes('6e') ||
    n.includes('6ème') ||
    n.includes('5e') ||
    n.includes('5ème') ||
    n.includes('4e') ||
    n.includes('4ème') ||
    n.includes('3e') ||
    n.includes('3ème') ||
    n.includes('seconde') ||
    n.includes('2nde') ||
    n.includes('première') ||
    n.includes('1re') ||
    n.includes('terminale') ||
    n.includes('secondary') ||
    n.includes('secondaire')
  ) {
    return 'secondaire';
  }

  return 'unknown';
}

export function getClassGroupDescriptor(
  cls: Partial<ClassSection>,
  technicalSpecialties?: TechnicalSpecialty[],
  activeSchoolId?: string
): ClassGroupDescriptor {
  const section = normalizeClassSection(cls);
  const cycle = normalizeClassCycle(cls);
  const teachingType = resolveEducationType(cls.educationType, cls.specialtyId).value;

  let specialtyName = '';
  let label = 'AUTRES / À VÉRIFIER';

  if (section !== 'unknown' && cycle !== 'unknown') {
    const sectionLabel = section === 'francophone' ? 'FRANCOPHONE' : 'ANGLOPHONE';
    const cycleLabel = cycle === 'maternelle'
      ? (section === 'francophone' ? 'MATERNELLE' : 'NURSERY')
      : cycle === 'primaire'
        ? (section === 'francophone' ? 'PRIMAIRE' : 'PRIMARY')
        : (section === 'francophone' ? 'SECONDAIRE' : 'SECONDARY');

    if (teachingType === 'technical') {
      const isAnglophone = section === 'anglophone';
      const typeLabel = isAnglophone ? 'TECHNICAL' : 'TECHNIQUE';

      if (cls.specialtyId && technicalSpecialties && activeSchoolId) {
        // Multi-school specialty lookup logic
        const found = technicalSpecialties.find(
          s => s.id === cls.specialtyId?.trim() && String(s.schoolId || '') === activeSchoolId
        );
        if (found && found.name && found.isActive !== false) {
          specialtyName = found.name;
        } else {
          // If not found in active school, check legacy/global specialty without schoolId
          const anyFound = technicalSpecialties.find(s => s.id === cls.specialtyId?.trim());
          if (anyFound && anyFound.name && anyFound.isActive !== false && !anyFound.schoolId) {
            specialtyName = anyFound.name;
          }
        }
      }

      if (specialtyName) {
        label = `${sectionLabel} — ${cycleLabel} — ${typeLabel} (${specialtyName.toUpperCase()})`;
      } else {
        label = `${sectionLabel} — ${cycleLabel} — ${typeLabel} (SPÉCIALITÉ À VÉRIFIER)`;
      }
    } else {
      const isAnglophone = section === 'anglophone';
      const typeLabel = isAnglophone ? 'GENERAL' : 'GÉNÉRAL';
      label = `${sectionLabel} — ${cycleLabel} — ${typeLabel}`;
    }
  }

  const key = `${section}__${cycle}__${teachingType}__${specialtyName}`;

  return {
    section,
    cycle,
    teachingType,
    specialtyName,
    label,
    key
  };
}

export function compareGroupDescriptors(a: ClassGroupDescriptor, b: ClassGroupDescriptor): number {
  const sectionOrder = { francophone: 0, anglophone: 1, unknown: 2 };
  const cycleOrder = { maternelle: 0, primaire: 1, secondaire: 2, unknown: 3 };
  const typeOrder = { general: 0, technical: 1, unknown: 2 };

  const aSection = sectionOrder[a.section] ?? 2;
  const bSection = sectionOrder[b.section] ?? 2;
  if (aSection !== bSection) return aSection - bSection;

  const aCycle = cycleOrder[a.cycle] ?? 3;
  const bCycle = cycleOrder[b.cycle] ?? 3;
  if (aCycle !== bCycle) return aCycle - bCycle;

  const aType = typeOrder[a.teachingType] ?? 2;
  const bType = typeOrder[b.teachingType] ?? 2;
  if (aType !== bType) return aType - bType;

  return a.specialtyName.localeCompare(b.specialtyName);
}
