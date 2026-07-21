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

export function normalizeTechnicalSpecialtyName(name: string): string {
  const nfc = (name || '').normalize('NFC');
  const trimmed = nfc.trim();
  return trimmed.replace(/\s+/g, ' ');
}

export function getTechnicalSpecialtyCanonicalKey(name: string): string {
  return normalizeTechnicalSpecialtyName(name).toLocaleLowerCase('fr-FR');
}

export function buildTechnicalSpecialtyDocumentId(
  schoolId: string,
  normalizedNameOrCode: string
): string {
  const cleanSchoolId = (schoolId || '').trim();
  const canonicalKey = getTechnicalSpecialtyCanonicalKey(normalizedNameOrCode);
  const encoded = encodeURIComponent(canonicalKey);

  if (!cleanSchoolId) {
    throw new Error('schoolId requis pour créer une filière technique.');
  }
  if (!canonicalKey) {
    throw new Error('Nom de filière invalide.');
  }
  if (cleanSchoolId.includes('/') || canonicalKey.includes('/') || encoded.includes('/')) {
    throw new Error('Identifiant de filière invalide.');
  }

  return `${cleanSchoolId}__spec__${encoded}`;
}

export function buildTechnicalClassDocumentId(
  schoolId: string,
  catalogLevelId: string,
  specialtyId: string
): string {
  const cleanSchoolId = (schoolId || '').trim();
  const cleanCatalogLevelId = (catalogLevelId || '').trim();
  const cleanSpecialtyId = (specialtyId || '').trim();

  if (!cleanSchoolId) {
    throw new Error('schoolId requis pour créer une classe technique.');
  }
  if (!cleanCatalogLevelId) {
    throw new Error('catalogLevelId requis pour créer une classe technique.');
  }
  if (!cleanSpecialtyId) {
    throw new Error('specialtyId requis pour créer une classe technique.');
  }
  if (cleanSchoolId.includes('/') || cleanCatalogLevelId.includes('/') || cleanSpecialtyId.includes('/')) {
    throw new Error('Identifiant de classe technique invalide.');
  }

  return `${cleanSchoolId}__${cleanCatalogLevelId}__technical__${encodeURIComponent(cleanSpecialtyId)}`;
}

export function getDisplayClassName(name: string): string {
  const trimmed = (name || '').trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'maternelle 1') return 'Petite Section';
  if (lower === 'maternelle 2') return 'Moyenne Section';
  if (lower === 'maternelle 3') return 'Grande Section';

  return trimmed;
}

export function resolveClassActiveStatus(cls?: { isActive?: boolean } | null): boolean {
  if (!cls) return false;
  return cls.isActive !== false;
}
