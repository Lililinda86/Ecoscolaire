/** Public metadata only. PDFs and full extraction remain outside the public repository.
 * 2018 is the cover edition, NOT the date in the download filename. No current-edition
 * or redistribution permission claim follows from ministry hosting.
 */
export const minedubDocuments = [
  { id: 'minedub-fr-primary-1', download: '5872/01-programme-niveau-01-2019.pdf', title: 'Curriculum primaire francophone — niveau 1 (SIL / CP)', language: 'fr', levels: ['SIL', 'CP'], pages: 135, sha: '38f57980080bbfddb5fd5d4ca83b553ced3ed36ef9447eb333b9deea76b9fe81' },
  { id: 'minedub-fr-primary-2', download: '5868/02-programme-niveau-02-2019.pdf', title: 'Curriculum primaire francophone — niveau 2 (CE1 / CE2)', language: 'fr', levels: ['CE1', 'CE2'], pages: 170, sha: '6dc059638d59463d55f12d6c9488bf04fa1ae9c00e1d51891f80702108dce6a2' },
  { id: 'minedub-fr-primary-3', download: '5866/03-programme-niveau-03-2019.pdf', title: 'Curriculum primaire francophone — niveau 3 (CM1 / CM2)', language: 'fr', levels: ['CM1', 'CM2'], pages: 193, sha: '916bffbda61442b628c42bb8fc74703e145b6f250a51d2b06b74549ae9dcc468' },
  { id: 'minedub-fr-nursery', download: '6165/programme-maternel-2019.pdf', title: 'Curriculum maternel francophone', language: 'fr', levels: ['1ère année', '2ème année'], pages: 113, sha: '4a7ab7a042860343b31a20ef2d4d70a0f2a5be3ddb865cc70a192cde863e7cab' },
  { id: 'minedub-en-primary-1', download: '5853/01-program-level-one-2019.pdf', title: 'English primary curriculum — level one (Class 1 / 2)', language: 'en', levels: ['Class 1', 'Class 2'], pages: 86, sha: '38a7c7eddea5ede2bc05bf071716e7067fd9fb987cad2d43fd33a9e294baf957' },
  { id: 'minedub-en-primary-2', download: '5850/02-program-level-two-2019.pdf', title: 'English primary curriculum — level two (Class 3 / 4)', language: 'en', levels: ['Class 3', 'Class 4'], pages: 99, sha: '1921b9d044f23849c1532f403021e0a8d23a46123d4b225b8b083b827e3fdd1c' },
  { id: 'minedub-en-primary-3', download: '5849/03-program-level-three-2019.pdf', title: 'English primary curriculum — level three (Class 5 / 6)', language: 'en', levels: ['Class 5', 'Class 6'], pages: 104, sha: '3d9828312e9e4832cfdf3beb5f79bd0b2fc0bd1a2722c2f0eb5853c6946994bc' },
  { id: 'minedub-en-nursery', download: '6161/program-nursery-2019.pdf', title: 'English nursery curriculum', language: 'en', levels: ['Nursery One', 'Nursery Two'], pages: 99, sha: 'e7c44dd2f7db60e95205aace826a3eb662fccf2ef91926bcd7e96056a8b51756' },
  { id: 'minedub-fr-primary-2-variant', download: '6083/curriculum-ce1-ce2-niveau-02.pdf', title: 'Curriculum CE1 / CE2 — autre fichier du catalogue, même édition', language: 'fr', levels: ['CE1', 'CE2'], pages: 171, sha: 'a9805330c96f543f391c92fec40796831836cb4ea763e4d2efa1b561cfb009ed' },
  { id: 'minedub-fr-primary-3-variant', download: '6087/curriculum-cm1-cm2-niveau-03.pdf', title: 'Curriculum CM1 / CM2 — autre fichier du catalogue, même édition', language: 'fr', levels: ['CM1', 'CM2'], pages: 194, sha: '4bd3c0a2690569794ef7d51f62401ab4cf6bdfb5be4027cd90eff10fb63904ff' },
];
export interface StructuredReviewExcerpt {
  id: string; documentId: string; sourcePdfPage: number; sourcePrintedPage: number;
  sourceLocator: string; level: string; subject: string; domain: string;
  officialUnit: string | null; officialLesson: string | null; objectiveParaphrase: string;
  competencyParaphrase: string; recommendedHours: number | null; language: 'fr' | 'en';
  status: 'PEDAGOGICAL_APPROVAL_REQUIRED';
}
/** Short analytical paraphrases, not a republication or a complete curriculum import.
 * Planning examples and local class mappings are separate human decisions.
 */
export const structuredReviewExcerpts: StructuredReviewExcerpt[] = [
  { id: 'nursery-fr-sorting', documentId: 'minedub-fr-nursery', sourcePdfPage: 62, sourcePrintedPage: 63,
    sourceLocator: 'Tableau 17, Logiques et ensembles, thème 1 école, colonne 2ème année', level: '2ème année', subject: 'Initiation aux mathématiques', domain: 'Éveil scientifique et technologique', officialUnit: 'Thème de vie 1 : école', officialLesson: null,
    objectiveParaphrase: 'Trier des éléments naturels en suivant une consigne.', competencyParaphrase: 'Mobiliser des notions mathématiques dans la manipulation.', recommendedHours: null, language: 'fr', status: 'PEDAGOGICAL_APPROVAL_REQUIRED' },
  { id: 'nursery-en-sorting', documentId: 'minedub-en-nursery', sourcePdfPage: 44, sourcePrintedPage: 45,
    sourceLocator: 'Table 20 Mathematics, Nursery One, Classifying elements', level: 'Nursery One', subject: 'Mathematics', domain: 'Science and Technological Skills Development', officialUnit: null, officialLesson: null,
    objectiveParaphrase: 'Classify elements and identify colours and similarities.', competencyParaphrase: 'Apply classification to objects and personal belongings.', recommendedHours: null, language: 'en', status: 'PEDAGOGICAL_APPROVAL_REQUIRED' },
  { id: 'primary-fr-sharing', documentId: 'minedub-fr-primary-1', sourcePdfPage: 71, sourcePrintedPage: 72,
    sourceLocator: 'Nombres et calculs, unité 8 communications, colonne CP', level: 'CP', subject: 'Mathématiques', domain: 'Nombres et calculs', officialUnit: 'Unité 8 : communications', officialLesson: null,
    objectiveParaphrase: 'Représenter et écrire des fractions par partage en trois ou cinq parts égales.', competencyParaphrase: 'Utiliser le partage équitable pour représenter une fraction.', recommendedHours: null, language: 'fr', status: 'PEDAGOGICAL_APPROVAL_REQUIRED' },
  { id: 'primary-en-sharing', documentId: 'minedub-en-primary-1', sourcePdfPage: 48, sourcePrintedPage: 48,
    sourceLocator: 'Table 21 Mathematics, Numbers and Operations, Class 1 column', level: 'Class 1', subject: 'Mathematics', domain: 'Numbers and Operations', officialUnit: null, officialLesson: null,
    objectiveParaphrase: 'Share items fairly in the context of numbers and fractions.', competencyParaphrase: 'Associate quantities with numbers and use sharing in practical situations.', recommendedHours: null, language: 'en', status: 'PEDAGOGICAL_APPROVAL_REQUIRED' },
];
