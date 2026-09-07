export function curriculumProvenanceLabel(sourceType: unknown): string {
  if (sourceType === 'mock') return 'Démonstration non homologuée';
  if (sourceType === 'official') return 'Origine officielle déclarée ; authentification documentaire à vérifier';
  return 'Provenance non renseignée';
}

export function curriculumProvenanceLink(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
