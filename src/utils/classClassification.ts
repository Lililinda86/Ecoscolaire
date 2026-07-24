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

export function normalizeSectionValue(value?: string): 'francophone' | 'anglophone' | 'unknown' {
  if (!value) return 'unknown';
  const clean = value.toLowerCase().trim();
  if (clean === 'francophone') return 'francophone';
  if (clean === 'anglophone') return 'anglophone';
  return 'unknown';
}

export function normalizeClassSection(cls: Partial<ClassSection>): NormalizedSection {
  // 1. Examine type
  const typeVal = normalizeSectionValue(cls.type);
  if (typeVal !== 'unknown') return typeVal;

  // 2. Examine section
  const sectionVal = normalizeSectionValue(cls.section);
  return sectionVal;
}

export function normalizeClassName(value?: string): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .toLowerCase()
    .replace(/[_-]+/g, ' ') // Dash/underscore to single space
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .trim();
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
  const n = normalizeClassName(cls.name);

  // Exact names/regex for maternelle:
  if (
    n === 'preschool' ||
    n === 'nursery' ||
    n === 'maternelle' ||
    n === 'pre nursery' ||
    n === 'pre maternelle' ||
    n === 'petite section' ||
    n === 'moyenne section' ||
    n === 'grande section' ||
    /^(nursery|maternelle) [1-3]$/.test(n)
  ) {
    return 'maternelle';
  }

  // Exact names/regex for primaire:
  if (
    n === 'sil' ||
    n === 'cp' ||
    n === 'ce1' ||
    n === 'ce2' ||
    n === 'cm1' ||
    n === 'cm2' ||
    n === 'primary' ||
    n === 'primaire' ||
    /^class [1-6]$/.test(n)
  ) {
    return 'primaire';
  }

  // Exact names/regex for secondaire:
  if (
    n === 'terminale' ||
    n === 'seconde' ||
    n === 'premiere' ||
    n === 'secondary' ||
    n === 'secondaire' ||
    n === 'lower sixth' ||
    n === 'upper sixth' ||
    /^(6|5|4|3)e(me)?( technique)?$/.test(n) ||
    /^(1|2)nd(e)?( technique)?$/.test(n) ||
    /^1re( technique)?$/.test(n) ||
    /^form [1-5]$/.test(n) ||
    /^technical form [1-5]$/.test(n) ||
    /^(lower|upper) sixth technical$/.test(n)
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
  const eduRes = resolveEducationType(cls.educationType, cls.specialtyId);
  const teachingType = eduRes.value;

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
    } else if (teachingType === 'general') {
      const isAnglophone = section === 'anglophone';
      const typeLabel = isAnglophone ? 'GENERAL' : 'GÉNÉRAL';
      label = `${sectionLabel} — ${cycleLabel} — ${typeLabel}`;
    } else {
      // Teaching type is unknown
      const isAnglophone = section === 'anglophone';
      const typeLabel = isAnglophone ? 'TYPE TO VERIFY' : 'TYPE À VÉRIFIER';
      label = `${sectionLabel} — ${cycleLabel} — ${typeLabel}`;
    }
  }

  // Ensure unique key for the "unknown/unverified" group too, avoiding duplicates
  const key = section === 'unknown' || cycle === 'unknown'
    ? 'unknown_group'
    : `${section}__${cycle}__${teachingType}__${specialtyName}`;

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
