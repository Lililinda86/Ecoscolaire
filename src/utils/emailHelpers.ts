export function normalizeParentEmails(input: string | string[] | undefined | null): string[] {
  if (!input) return [];
  
  let rawEmails: string[] = [];
  
  if (typeof input === 'string') {
    // Séparateurs acceptés : virgule, point-virgule, espace, retours ligne
    rawEmails = input.split(/[\s,;]+/);
  } else if (Array.isArray(input)) {
    rawEmails = input;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  const normalized = rawEmails
    .map(e => e.toLowerCase().trim())
    .filter(e => e.length > 0)
    .filter(e => emailRegex.test(e));
    
  // Dédupliquer
  return Array.from(new Set(normalized));
}
