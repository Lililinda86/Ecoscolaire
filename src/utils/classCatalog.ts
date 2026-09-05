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
  if (specialtyId && specialtyId.trim()) {
    return { value: 'technical', isAnomaly: educationType === 'general' };
  }
  if (educationType === 'general') {
    return { value: 'general', isAnomaly: false };
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
  technicalSpecialties?: Array<{ id: string; schoolId?: string; name: string; isActive?: boolean }>,
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
    if (found && found.name && found.isActive !== false) {
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

export type FrancophoneMaternelleLevelId =
  | 'fr-preschool-ps'
  | 'fr-preschool-ms'
  | 'fr-preschool-gs';

const FRANCOPHONE_MATERNELLE_ALIASES: Record<string, FrancophoneMaternelleLevelId> = {
  'maternelle 1': 'fr-preschool-ps',
  'petite section': 'fr-preschool-ps',
  'maternelle petite section': 'fr-preschool-ps',
  'maternelle 2': 'fr-preschool-ms',
  'moyenne section': 'fr-preschool-ms',
  'maternelle moyenne section': 'fr-preschool-ms',
  'maternelle 3': 'fr-preschool-gs',
  'grande section': 'fr-preschool-gs',
  'maternelle grande section': 'fr-preschool-gs'
};

const FRANCOPHONE_MATERNELLE_DISPLAY_NAMES: Record<FrancophoneMaternelleLevelId, string> = {
  'fr-preschool-ps': 'Maternelle Petite Section',
  'fr-preschool-ms': 'Maternelle Moyenne Section',
  'fr-preschool-gs': 'Maternelle Grande Section'
};

export function normalizeFrancophoneMaternelleLevel(
  name: string
): FrancophoneMaternelleLevelId | null {
  const normalized = (name || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR');
  return FRANCOPHONE_MATERNELLE_ALIASES[normalized] || null;
}

export function getDisplayClassName(name: string): string {
  const trimmed = (name || '').trim();
  const levelId = normalizeFrancophoneMaternelleLevel(trimmed);
  return levelId ? FRANCOPHONE_MATERNELLE_DISPLAY_NAMES[levelId] : trimmed;
}

export type ClassOptionLabelItem = {
  id: string;
  name: string;
  schoolId?: string;
  section?: string;
  type?: string;
  language?: string;
  level?: string;
  campus?: string;
  site?: string;
};

const normalizeLabelPart = (value?: string): string =>
  (value || '').normalize('NFC').trim().replace(/\s+/g, ' ');

export function getClassOptionLabel(
  classItem: ClassOptionLabelItem,
  allClasses: ClassOptionLabelItem[]
): string {
  const displayName = getDisplayClassName(classItem.name);
  const uniqueClasses = new Map<string, ClassOptionLabelItem>();

  [...allClasses, classItem].forEach(item => {
    if (item?.id) uniqueClasses.set(item.id, item);
  });

  const duplicates = [...uniqueClasses.values()].filter(item => {
    const sameSchool = !classItem.schoolId || !item.schoolId || item.schoolId === classItem.schoolId;
    return sameSchool && getDisplayClassName(item.name) === displayName;
  });

  if (duplicates.length <= 1) return displayName;

  const candidateValues = [
    (item: ClassOptionLabelItem) => normalizeLabelPart(item.section || item.type),
    (item: ClassOptionLabelItem) => normalizeLabelPart(item.language),
    (item: ClassOptionLabelItem) => normalizeLabelPart(item.level),
    (item: ClassOptionLabelItem) => normalizeLabelPart(item.campus),
    (item: ClassOptionLabelItem) => normalizeLabelPart(item.site)
  ];

  for (const getCandidate of candidateValues) {
    const values = duplicates.map(getCandidate);
    const normalizedValues = values.map(value => value.toLocaleLowerCase('fr-FR'));
    if (values.every(Boolean) && new Set(normalizedValues).size === duplicates.length) {
      return `${displayName} · ${getCandidate(classItem)}`;
    }
  }

  const ids = duplicates.map(item => normalizeLabelPart(item.id));
  const maxLength = Math.max(...ids.map(id => id.length));
  let suffixLength = Math.min(6, maxLength);
  while (suffixLength < maxLength && new Set(ids.map(id => id.slice(-suffixLength))).size !== ids.length) {
    suffixLength += 1;
  }

  return `${displayName} · ${normalizeLabelPart(classItem.id).slice(-suffixLength)}`;
}

export function resolveClassActiveStatus(cls?: { isActive?: boolean } | null): boolean {
  if (!cls) return false;
  return cls.isActive !== false;
}
