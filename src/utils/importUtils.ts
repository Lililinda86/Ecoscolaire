import { DEFAULT_CLASS_LEVELS } from '../constants/defaultClasses';

/**
 * Normalise un numéro de téléphone camerounais au format international +237XXXXXXXXX
 * Supporte les formats : 650336558, 237650336558, +237650336558, 00237650336558
 */
export function normalizeCameroonPhoneNumber(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^0-9]/g, '');

  if (cleaned.length === 9 && (cleaned.startsWith('6') || cleaned.startsWith('2') || cleaned.startsWith('8'))) {
    return `+237${cleaned}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith('237')) {
    return `+${cleaned}`;
  }
  if (cleaned.length === 14 && cleaned.startsWith('00237')) {
    return `+${cleaned.substring(2)}`;
  }
  
  // Retourne null si le format n'est pas camerounais ou est invalide
  return null;
}

/**
 * Normalise le nom d'une classe brute pour la faire correspondre avec le référentiel DEFAULT_CLASS_LEVELS
 */
export function normalizeClassName(rawName: string): { matchedName: string; matchedId: string; section: 'francophone' | 'anglophone'; suggestion?: string } | null {
  if (!rawName) return null;

  const normalized = rawName.toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Supprime les accents
    .replace(/[._-]/g, ' ') // Remplacer par des espaces
    .replace(/\s+/g, ' ') // Espaces multiples
    .trim();

  // Mappings directs et tolérance aux erreurs courantes
  const exactMappings: Record<string, string> = {
    'PRE NURSERY': 'Pre-Nursery',
    'NURSERY 1': 'Nursery 1',
    'NURSERY 2': 'Nursery 2',
    'NURSERY 3': 'Nursery 3',
    'CLASS 1': 'Class 1',
    'CLASS 2': 'Class 2',
    'CLASS 3': 'Class 3',
    'CLASS 4': 'Class 4',
    'CLASS 5': 'Class 5',
    'CLASS 6': 'Class 6',
    'FORM 1': 'Form 1',
    'FORM 2': 'Form 2',
    'FORM 3': 'Form 3',
    'FORM 4': 'Form 4',
    'FORM 5': 'Form 5',
    'LOWER SIXTH': 'Lower Sixth',
    'UPPER SIXTH': 'Upper Sixth',
    'PRE MATERNELLE': 'Pré-maternelle',
    'PRE MATER': 'Pré-maternelle',
    'PETITE SECTION': 'Petite Section',
    'MOYENNE SECTION': 'Moyenne Section',
    'GRANDE SECTION': 'Grande Section',
    'MATERNELLE 1': 'Petite Section',
    'MATERNELLE 2': 'Moyenne Section',
    'MATERNELLE 3': 'Grande Section',
    'SIL': 'SIL',
    'CP': 'CP',
    'CE1': 'CE1',
    'CE2': 'CE2',
    'CM1': 'CM1',
    'CM2': 'CM2',
    '6E': '6e',
    '6EME': '6e',
    '6E TECHNIQUE': '6e technique',
    '6EME TECHNIQUE': '6e technique',
    '5E': '5e',
    '5EME': '5e',
    '5E TECHNIQUE': '5e technique',
    '5EME TECHNIQUE': '5e technique',
    '4E': '4e',
    '4EME': '4e',
    '4E TECHNIQUE': '4e technique',
    '4EME TECHNIQUE': '4e technique',
    '3E': '3e',
    '3EME': '3e',
    '3E TECHNIQUE': '3e technique',
    '3EME TECHNIQUE': '3e technique',
    '2NDE': '2nde',
    'SECONDE': '2nde',
    '1RE': '1re',
    'PREMIERE': '1re',
    'TERMINALE': 'Terminale'
  };

  // 1. Recherche par mapping exact
  if (exactMappings[normalized]) {
    const targetName = exactMappings[normalized];
    const found = DEFAULT_CLASS_LEVELS.find(c => c.name.toLowerCase() === targetName.toLowerCase());
    if (found) {
      return { matchedName: found.name, matchedId: found.id, section: found.section };
    }
  }

  // 2. Recherche tolérante sur les fautes courantes
  const corrections: Record<string, { target: string; suggestion: string }> = {
    'FROM 1': { target: 'Form 1', suggestion: 'Form 1' },
    'FROM 2': { target: 'Form 2', suggestion: 'Form 2' },
    'CLASS SIX': { target: 'Class 6', suggestion: 'Class 6' },
    'CM 2': { target: 'CM2', suggestion: 'CM2' },
    'SIL A': { target: 'SIL', suggestion: 'SIL' },
    'CP A': { target: 'CP', suggestion: 'CP' },
    '6EME TECH': { target: '6e technique', suggestion: '6e technique' },
    '5EME TECH': { target: '5e technique', suggestion: '5e technique' }
  };

  if (corrections[normalized]) {
    const target = corrections[normalized].target;
    const found = DEFAULT_CLASS_LEVELS.find(c => c.name.toLowerCase() === target.toLowerCase());
    if (found) {
      return { matchedName: found.name, matchedId: found.id, section: found.section, suggestion: corrections[normalized].suggestion };
    }
  }

  // 3. Fallback partiel
  const foundPartial = DEFAULT_CLASS_LEVELS.find(c => c.name.toLowerCase() === normalized.toLowerCase());
  if (foundPartial) {
    return { matchedName: foundPartial.name, matchedId: foundPartial.id, section: foundPartial.section };
  }

  return null;
}

/**
 * Retourne le barème de frais standard camerounais/ITALO pour une classe et section données
 */
export function getDefaultFeesForClass(className: string, section: 'francophone' | 'anglophone') {
  // Par défaut (Maternelle et Primaire)
  let registration = 15000;
  let tuition = 85000;
  let t1 = 40000;
  let t2 = 30000;
  let t3 = 15000;

  // Détection des classes secondaires (collège/lycée général et technique)
  const isSecondary = 
    /^(6|5|4|3)[èe]me/i.test(className) ||
    /^(Seconde|Premi[èe]re|Terminale)/i.test(className) ||
    /^(Form|Technical Form)/i.test(className) ||
    /Sixth/i.test(className);

  if (isSecondary) {
    registration = 20000;
  }

  if (section === 'anglophone') {
    if (className === 'Pre-Nursery') {
      tuition = 130000; t1 = 60000; t2 = 40000; t3 = 20000;
    } else if (className.startsWith('Nursery')) {
      tuition = 115000; t1 = 50000; t2 = 40000; t3 = 25000;
    } else if (className === 'Class 6') {
      tuition = 90000; t1 = 50000; t2 = 40000; t3 = 0;
    } else if (className === 'Form 1') {
      tuition = 85000; t1 = 50000; t2 = 40000; t3 = 25000;
    } else if (className === 'Form 2') {
      tuition = 85000; t1 = 55000; t2 = 40000; t3 = 25000;
    }
  } else {
    // Francophone
    if (className === 'CM2') {
      tuition = 90000; t1 = 50000; t2 = 40000; t3 = 0;
    } else if (className === '6ème') {
      tuition = 115000; t1 = 50000; t2 = 40000; t3 = 25000;
    } else if (className === '5ème') {
      tuition = 120000; t1 = 55000; t2 = 40000; t3 = 25000;
    }
  }

  return { registration, tuition, t1, t2, t3 };
}
