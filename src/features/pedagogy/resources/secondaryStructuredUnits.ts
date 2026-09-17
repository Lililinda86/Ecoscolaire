import { moduleCompetencyOverviews } from './moduleCompetencyOverviews';
import metadata from '../../../../docs/pedagogy-content-completion/MINESEC_VERIFIED_FILE_METADATA.json';

/** Documentary module index, not an adoption or a lesson-by-lesson transcription.
 * Overview objectives paraphrase the source's family-of-situations column only.
 * Competencies are brief module-introduction paraphrases; activities and assessment remain null. */
export interface SecondaryStructuredUnit {
  id: string; catalogLevelId: string; level: string; language: 'fr' | 'en'; subject: string;
  title: string; objective: string; competency: string; competencySourcePage: number; competencyScope: 'MODULE_OVERVIEW'; activity: string | null;
  assessment: string | null; sourceDocumentId: string; sourcePage: number; sourceVersion: string;
  sourceUrl: string; sourceLocator: string; documentaryHours: number;
  status: 'DOCUMENTARY_MODULE_REVIEW_REQUIRED'; rights: 'LINK_METADATA_ONLY';
}
const source = (id: string) => metadata.files.find(d => d.fileId === id)!;
const aims = {
  fr: ['Quantifier des situations courantes.', 'Interpréter des données du quotidien.', 'Représenter et transformer des formes planes.', 'Décrire des objets dans l’espace.'],
  en: ['Use numbers to describe quantities.', 'Represent shapes and their transformations.', 'Model everyday solid objects.', 'Interpret data and uncertainty.', 'Express relationships symbolically.'],
};
type Row = [string, number, number]; // original overview label paraphrase, source page, documentary hours
const units = (file: string, level: string, catalogLevelId: string, language: 'fr' | 'en', rows: Row[], aimIndices: number[]) => rows.map(([title, sourcePage, documentaryHours], i): SecondaryStructuredUnit => ({
  id: `minesec-${file}-${catalogLevelId}-module-${i + 1}`, catalogLevelId, level, language,
  subject: language === 'fr' ? 'Mathématiques' : 'Mathematics', title, objective: aims[language][aimIndices[i]],
  competency: moduleCompetencyOverviews[catalogLevelId][i][1], competencySourcePage: moduleCompetencyOverviews[catalogLevelId][i][0], competencyScope: 'MODULE_OVERVIEW', activity: null, assessment: null, sourceDocumentId: 'minesec-' + file,
  sourcePage, sourceVersion: source(file).sha256, sourceUrl: source(file).url,
  sourceLocator: language === 'fr' ? 'Tableau synoptique, ligne ' + level : 'Comprehensive module table, ' + level + ' rows',
  documentaryHours, status: 'DOCUMENTARY_MODULE_REVIEW_REQUIRED', rights: 'LINK_METADATA_ONLY',
}));
export const secondaryStructuredUnits: SecondaryStructuredUnit[] = [
  ...units('35', '6e', 'fr-secondary-6e', 'fr', [['Décimaux et fractions',19,32],['Données',19,11],['Géométrie plane',19,46],['Solides',19,11]], [0,1,2,3]),
  ...units('35', '5e', 'fr-secondary-5e', 'fr', [['Décimaux et fractions',19,32],['Données',19,11],['Géométrie plane',19,46],['Solides',19,11]], [0,1,2,3]),
  ...units('52', '4e', 'fr-secondary-4e', 'fr', [['Nombres rationnels',15,32],['Données',15,11],['Géométrie plane',15,46],['Solides',15,11]], [0,1,2,3]),
  ...units('52', '3e', 'fr-secondary-3e', 'fr', [['Nombres réels',15,34],['Données',15,11],['Géométrie plane',15,46],['Solides',15,9]], [0,1,2,3]),
  ...units('8', 'Form 1', 'en-secondary-form1', 'en', [['Numbers and operations',20,30],['Plane shapes',20,45],['Solid shapes',20,15],['Elementary statistics',20,10]], [0,1,2,3]),
  ...units('8', 'Form 2', 'en-secondary-form2', 'en', [['Numbers and operations',20,30],['Plane shapes',20,40],['Solid shapes',20,15],['Data and probability',20,10],['Introductory algebra',20,5]], [0,1,2,3,4]),
  ...units('62', 'Form 3', 'en-secondary-form3', 'en', [['Numbers and sets',18,20],['Plane geometry',18,24],['Solid shapes',18,10],['Data and probability',18,10],['Algebraic reasoning',18,40]], [0,1,2,3,4]),
  ...units('62', 'Form 4', 'en-secondary-form4', 'en', [['Numbers and sets',18,24],['Plane geometry',18,44],['Algebraic reasoning',19,36]], [0,1,4]),
  ...units('62', 'Form 5', 'en-secondary-form5', 'en', [['Plane geometry',19,44],['Solid shapes',19,20],['Data and probability',19,40]], [1,2,3]),
];

export function structuredModulesFor(documentId: string, level?: string) {
  return secondaryStructuredUnits.filter(unit => unit.sourceDocumentId === documentId && (!level || unit.catalogLevelId === level));
}
