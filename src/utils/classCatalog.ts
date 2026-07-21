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
