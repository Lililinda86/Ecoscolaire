export type CanonicalClassCycle = 'nursery' | 'primary' | 'secondary' | 'unknown';
const normalizeClassValue = (value: unknown): string => typeof value === 'string'
  ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  : '';
export const resolveCanonicalClassCycle = (classData: Record<string, unknown>): CanonicalClassCycle => {
  for (const value of [classData.cycle, classData.level, classData.type]) {
    const normalized = normalizeClassValue(value);
    if (['preschool', 'nursery', 'maternelle', 'pre nursery'].includes(normalized)) return 'nursery';
    if (['primary', 'primaire'].includes(normalized)) return 'primary';
    if (['secondary', 'secondaire'].includes(normalized)) return 'secondary';
  }
  const catalogLevelId = normalizeClassValue(classData.catalogLevelId);
  if (catalogLevelId.includes('secondary')) return 'secondary';
  if (catalogLevelId.includes('primary')) return 'primary';
  if (catalogLevelId.includes('nursery') || catalogLevelId.includes('preschool')) return 'nursery';
  const name = normalizeClassValue(classData.name);
  if (/^(6|5|4|3)e(me)?$/.test(name) || /^form [1-4]$/.test(name)) return 'secondary';
  if (['sil', 'cp', 'ce1', 'ce2', 'cm1', 'cm2'].includes(name) || /^class [1-6]$/.test(name)) return 'primary';
  if (name === 'pre maternelle' || name === 'pre nursery' || /^(maternelle|nursery) [1-3]$/.test(name)) return 'nursery';
  return 'unknown';
};
