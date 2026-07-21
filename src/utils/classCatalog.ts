export function buildStandardClassDocumentId(
  schoolId: string,
  catalogLevelId: string
): string {
  const normalizedSchoolId = (schoolId || '').trim();
  const normalizedCatalogLevelId = (catalogLevelId || '').trim();

  if (!normalizedSchoolId) {
    throw new Error('schoolId requis pour créer une classe standard.');
  }

  if (!normalizedCatalogLevelId) {
    throw new Error('catalogLevelId requis pour créer une classe standard.');
  }

  if (
    normalizedSchoolId.includes('/') ||
    normalizedCatalogLevelId.includes('/')
  ) {
    throw new Error('Identifiant de classe standard invalide.');
  }

  return `${normalizedSchoolId}__${normalizedCatalogLevelId}`;
}

export type ResolvedEducationType = {
  value: 'general' | 'technical' | 'unknown';
  isAnomaly: boolean;
};

export function resolveEducationType(
  educationType?: 'general' | 'technical',
  specialtyId?: string
): ResolvedEducationType {
  if (educationType === 'technical') {
    return { value: 'technical', isAnomaly: false };
  }
  if (educationType === 'general') {
    return { value: 'general', isAnomaly: false };
  }
  if (specialtyId && specialtyId.trim()) {
    return { value: 'unknown', isAnomaly: true };
  }
  return { value: 'general', isAnomaly: false };
}

export function getEducationTypeDisplayLabel(
  value: 'general' | 'technical' | 'unknown',
  section?: string
): string {
  const isAnglophone = (section || '').toLowerCase().trim() === 'anglophone';
  if (value === 'technical') {
    return isAnglophone ? 'Technical' : 'Technique';
  }
  if (value === 'general') {
    return isAnglophone ? 'General' : 'Général';
  }
  return isAnglophone ? 'Type to verify' : 'Type à vérifier';
}

export function getSpecialtyName(
  specialtyId?: string,
  technicalSpecialties?: Array<{ id: string; schoolId?: string; name: string }>,
  currentSchoolId?: string,
  section?: string
): { name: string | null; isUnavailable: boolean } {
  if (!specialtyId || typeof specialtyId !== 'string' || !specialtyId.trim()) {
    return { name: null, isUnavailable: false };
  }

  const isAnglophone = (section || '').toLowerCase().trim() === 'anglophone';
  const unavailableLabel = isAnglophone ? 'Specialty unavailable' : 'Spécialité non disponible';

  if (technicalSpecialties && Array.isArray(technicalSpecialties) && currentSchoolId) {
    const found = technicalSpecialties.find(
      s => s.id === specialtyId.trim() && String(s.schoolId || '') === currentSchoolId
    );
    if (found && found.name) {
      return { name: found.name, isUnavailable: false };
    }
  }

  return { name: unavailableLabel, isUnavailable: true };
}
