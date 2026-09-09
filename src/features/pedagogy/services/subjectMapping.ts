/** Documentary matching only. Never proves teaching, requirement or adoption. */
export interface MappingSubject {
  id: string; schoolId?: string; name: string; section?: string; cycles?: string[];
  isActive?: boolean; localConfigurationStatus?: string;
}
export type MatchStatus = 'EXACT' | 'SAFE_ALIAS' | 'AMBIGUOUS' | 'MISSING_LOCAL_SUBJECT';
export interface SubjectMatch {
  officialSubject: string; localMatch: MappingSubject | null; candidates: MappingSubject[];
  referenceCandidates: MappingSubject[]; status: MatchStatus;
  action: 'REUSE_EXISTING' | 'PROPOSE_CREATE' | 'NEEDS_HUMAN_MAPPING'; reason: string;
}
const normalize = (value: string) => value.normalize('NFC').trim().toLocaleLowerCase('fr').replace(/\s+/g, ' ').replace(/[’‘]/g, "'");
// Explicit scoped aliases, not fuzzy search, translation or curriculum equivalence.
const aliases: Record<string, string[]> = {
  'Langue française': ['Français'],
  'English language': ['Anglais'],
  'Initiation aux mathématiques': ['Mathématiques'],
  'Initiation aux sciences et à la technologie': ['Sciences et technologie'],
  'Sciences et technologies': ['Sciences et technologie'],
  'Technologies de l’information et de la communication': ['Informatique et TIC'],
  'Français': ['French'],
  'Information and Communication Technologies': ['Information and Communication Technology'],
};
// Related labels are disclosed, never silently declared equivalent.
const related: Record<string, string[]> = {
  'Français et littérature': ['Français'],
  'English Language and Literature': ['English Language', 'Literature in English'],
  'Sciences humaines et sociales': ['Histoire', 'Géographie', 'Éducation à la citoyenneté et morale'],
  'Éducation artistique': ['Arts et culture', 'Activités pratiques et travaux manuels'],
  'Développement personnel': ['Éducation à la citoyenneté et morale', 'Éducation à la santé, à l’hygiène et à la sécurité', 'Activités pratiques et travaux manuels'],
  'Vocational Studies': ['Practical Skills'],
  'Arts': ['Creative Arts'],
  'Physical Education and Sports': ['Physical Education'],
};

export function matchOfficialSubjects(names: readonly string[], catalog: readonly MappingSubject[], schoolId: string, section: 'francophone' | 'anglophone', cycle = 'primary'): SubjectMatch[] {
  const scoped = catalog.filter(s => s.schoolId === schoolId && s.isActive !== false && (s.section === section || s.section === 'all') && s.cycles?.includes(cycle));
  const referenceOnly = (s: MappingSubject) => s.localConfigurationStatus === 'CATALOG_REFERENCE_ONLY';
  const local = scoped.filter(s => !referenceOnly(s));
  const result = names.map(officialSubject => {
    const exact = local.filter(s => normalize(s.name) === normalize(officialSubject));
    // Alias definitions apply only in their original language/subsystem context.
    const permitted = cycle === 'primary' && ((section === 'francophone' && officialSubject !== 'Français' && officialSubject !== 'Information and Communication Technologies') || (section === 'anglophone' && ['Français', 'Information and Communication Technologies'].includes(officialSubject))) ? aliases[officialSubject] || [] : [];
    const safe = local.filter(s => permitted.some(a => normalize(a) === normalize(s.name)));
    const relatedMatches = local.filter(s => (related[officialSubject] || []).some(a => normalize(a) === normalize(s.name)));
    const candidates = [...new Map([...exact, ...safe, ...relatedMatches].map(s => [s.id, s])).values()].sort((a, b) => a.id.localeCompare(b.id));
    const referenceCandidates = scoped.filter(s => referenceOnly(s) && normalize(s.name) === normalize(officialSubject));
    let status: MatchStatus = candidates.length > 1 || relatedMatches.length > 0 ? 'AMBIGUOUS' : exact.length === 1 ? 'EXACT' : safe.length === 1 ? 'SAFE_ALIAS' : 'MISSING_LOCAL_SUBJECT';
    if (cycle !== 'primary' && status === 'SAFE_ALIAS') status = 'AMBIGUOUS';
    return { officialSubject, localMatch: status === 'EXACT' || status === 'SAFE_ALIAS' ? candidates[0] : null, candidates, referenceCandidates, status,
      action: status === 'EXACT' || status === 'SAFE_ALIAS' ? 'REUSE_EXISTING' : status === 'AMBIGUOUS' || referenceCandidates.length ? 'NEEDS_HUMAN_MAPPING' : 'PROPOSE_CREATE',
      reason: status === 'EXACT' ? 'Libellé identique, même établissement, section et cycle.' : status === 'SAFE_ALIAS' ? 'Alias explicite de discipline dans le même contexte ; ne certifie pas le contenu enseigné.' : status === 'AMBIGUOUS' ? 'Découpage, périmètre ou plusieurs matières possibles : choix humain requis.' : referenceCandidates.length ? 'Référence documentaire disponible, mais aucune matière locale correspondante établie.' : 'Aucune matière locale correspondante : création éventuelle à valider humainement.',
    } as SubjectMatch;
  });
  // Never map two official disciplines automatically to a single local subject.
  for (const row of result) if (row.localMatch && result.filter(r => r.localMatch?.id === row.localMatch?.id).length > 1) {
    const id = row.localMatch.id;
    for (const duplicate of result.filter(r => r.localMatch?.id === id)) { duplicate.localMatch = null; duplicate.status = 'AMBIGUOUS'; duplicate.action = 'NEEDS_HUMAN_MAPPING'; duplicate.reason = 'Plusieurs disciplines officielles vers une même matière : décision humaine requise.'; }
  }
  return result;
}

export const primaryDocumentByLevel: Readonly<Record<string, string>> = {
  'fr-primary-sil': 'minedub-fr-primary-1', 'fr-primary-cp': 'minedub-fr-primary-1',
  'fr-primary-ce1': 'minedub-fr-primary-2', 'fr-primary-ce2': 'minedub-fr-primary-2',
  'fr-primary-cm1': 'minedub-fr-primary-3', 'fr-primary-cm2': 'minedub-fr-primary-3',
  'en-primary-1': 'minedub-en-primary-1', 'en-primary-2': 'minedub-en-primary-1',
  'en-primary-3': 'minedub-en-primary-2', 'en-primary-4': 'minedub-en-primary-2',
  'en-primary-5': 'minedub-en-primary-3', 'en-primary-6': 'minedub-en-primary-3',
};

export interface DocumentaryUnit { id: string; officialSubject: string; catalogLevelId: string; objectiveParaphrase: string; sourcePdfPage: number; documentId: string }
export interface DocumentaryWeek { id: string; schoolId: string; academicYearId: string; weekStartDate: string; status?: string }
/** Partial draft progression: uses only real calendar weeks and safe local links.
 * No repeating a short extract into a pretend annual curriculum; no hours/slots. */
export function proposeDocumentaryProgression(schoolId: string, yearId: string, levelId: string, mappings: SubjectMatch[], units: DocumentaryUnit[], weeks: DocumentaryWeek[]) {
  const calendar = weeks.filter(w => w.schoolId === schoolId && w.academicYearId === yearId && w.status === 'open' && /^\d{4}-\d{2}-\d{2}$/.test(w.weekStartDate)).sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate) || a.id.localeCompare(b.id));
  const used = new Set<string>();
  const available = units.filter(u => u.catalogLevelId === levelId && mappings.some(m => m.officialSubject === u.officialSubject && m.localMatch)).filter(u => { if (used.has(u.id)) return false; used.add(u.id); return true; });
  return available.map((unit, i) => ({ curriculumUnitId: unit.id + '-review-2018-v1', subjectId: mappings.find(m => m.officialSubject === unit.officialSubject)!.localMatch!.id,
    objective: unit.objectiveParaphrase, sourceDocumentId: unit.documentId, sourcePage: unit.sourcePdfPage,
    teachingWeekId: calendar[i]?.id || null, weekStartDate: calendar[i]?.weekStartDate || null,
    status: 'proposed' as const, calendarStatus: calendar[i] ? 'PROPOSED_FROM_EXISTING_CALENDAR' : 'CALENDAR_REQUIRED', coverage: 'PARTIAL_EXTRACTS_ONLY', teacherValidationRequired: true,
  }));
}
