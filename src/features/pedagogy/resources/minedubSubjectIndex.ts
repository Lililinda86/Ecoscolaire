/** Subject/domain names, not republication of the curriculum. Sources: authenticated
 * MINEDUB 2018 PDFs, tables of contents. No automatic school configuration/adoption. */
export interface SubjectReference { documentId: string; pdfPages: number[]; kind: 'subjects' | 'domains'; names: string[] }
const fr = ['Français et littérature', 'English language', 'Langues et cultures nationales', 'Mathématiques', 'Sciences et technologies', 'Technologies de l’information et de la communication', 'Sciences humaines et sociales', 'Éducation artistique', 'Éducation physique et sportive', 'Développement personnel'];
const en = ['English Language and Literature', 'Mathematics', 'Science and Technology', 'Français', 'Social Studies', 'Vocational Studies', 'Arts', 'Physical Education and Sports', 'National Languages and Cultures', 'Information and Communication Technologies'];
export const minedubSubjectIndex: SubjectReference[] = [
  { documentId: 'minedub-fr-primary-1', pdfPages: [5, 6], kind: 'subjects', names: fr.map((name, i) => ({ 0: 'Langue française', 3: 'Initiation aux mathématiques', 4: 'Initiation aux sciences et à la technologie' }[i] || name)) },
  { documentId: 'minedub-fr-primary-2', pdfPages: [5, 6], kind: 'subjects', names: fr },
  { documentId: 'minedub-fr-primary-3', pdfPages: [5, 6], kind: 'subjects', names: fr },
  { documentId: 'minedub-en-primary-1', pdfPages: [6, 7], kind: 'subjects', names: en.map((name, i) => i === 0 ? 'English Language' : name) },
  { documentId: 'minedub-en-primary-2', pdfPages: [5, 6], kind: 'subjects', names: en },
  { documentId: 'minedub-en-primary-3', pdfPages: [5, 6], kind: 'subjects', names: en },
  { documentId: 'minedub-fr-nursery', pdfPages: [5, 6], kind: 'domains', names: ['Langues et communication', 'Éveil scientifique et technologique', 'Vie courante', 'Création artistique et activités manuelles', 'Motricité générale'] },
  { documentId: 'minedub-en-nursery', pdfPages: [5, 6], kind: 'domains', names: ['Literacy and Communication', 'Science and Technological Skills Development', 'Practical Life Skills', 'Arts and Crafts', 'Motor Skills'] },
];

const primary: Record<string, string> = { sil: 'fr-primary-1', cp: 'fr-primary-1', ce1: 'fr-primary-2', ce2: 'fr-primary-2', cm1: 'fr-primary-3', cm2: 'fr-primary-3', 'class 1': 'en-primary-1', 'class 2': 'en-primary-1', 'class 3': 'en-primary-2', 'class 4': 'en-primary-2', 'class 5': 'en-primary-3', 'class 6': 'en-primary-3' };
export function referenceForClass(name: string, section: string) {
  const label = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const candidate = primary[label];
  const language = ['fr', 'francophone'].includes(section.toLowerCase()) ? 'fr' : ['en', 'anglophone'].includes(section.toLowerCase()) ? 'en' : null;
  if (candidate && language && candidate.startsWith(language + '-')) return { status: 'PARTIAL' as const, documentId: 'minedub-' + candidate, reason: 'Correspondance nominale du niveau primaire et de la section. Matières documentées ; configuration locale, édition applicable et adoption à vérifier.' };
  if (['2nde', 'seconde'].includes(label) && language === 'fr') return { status: 'PENDING_HUMAN_MAPPING' as const, documentId: 'minesec-seconde-english-2018-pending', reason: 'Document MINESEC anglais pour francophones consultable ; série A ou C/D, arrêté, empreinte et édition applicable à confirmer. Couverture limitée à une matière.' };
  if (/pré.?maternelle|prematernelle|pre.?nursery/.test(label)) return { status: 'PENDING_HUMAN_MAPPING' as const, documentId: null, reason: 'ITALO_EARLY_YEARS_PROGRAM : programme d’établissement à définir et valider, pas de curriculum MINEDUB distinct authentifié.' };
  if (/maternelle|nursery/.test(label)) return { status: 'PENDING_HUMAN_MAPPING' as const, documentId: language ? 'minedub-' + language + '-nursery' : null, reason: 'Domaines préscolaires disponibles ; correspondance entre les années ITALO et les deux années du document à décider humainement.' };
  return { status: 'MISSING_OFFICIAL_SOURCE' as const, documentId: null, reason: 'Aucune correspondance authentifiée intégrée pour cette classe et sa section. Ne pas substituer un programme d’un autre sous-système.' };
}
