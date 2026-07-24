/**
 * Normalise et valide l'identifiant de l'année scolaire au format canonique YYYY-YYYY.
 * Remplace '/' par '-' et retourne null si la valeur est invalide.
 */
export function normalizeAcademicYearId(year: string): string | null {
  if (typeof year !== 'string') return null;
  const trimmed = year.trim();
  const replaced = trimmed.replace(/\//g, '-');

  // Format attendu : YYYY-YYYY (ex: 2023-2024)
  const regex = /^\d{4}-\d{4}$/;
  if (!regex.test(replaced)) {
    return null;
  }

  // Vérification de la cohérence logique (ex: 2023-2024, Y2 = Y1 + 1)
  const [y1, y2] = replaced.split('-').map(Number);
  if (y2 !== y1 + 1) {
    return null;
  }

  return replaced;
}
