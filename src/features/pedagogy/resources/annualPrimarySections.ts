import { minedubDocuments } from './minedubVerified';
/** Located annual section summaries, not complete lessons or a weekly schedule.
 * Each class column was read independently. Contradictory cells are excluded.
 */
export interface AnnualPrimarySection {
 id: string; catalogLevelId: string; documentId: string; language: 'fr' | 'en';
 theme: string; domain: string; objective: string; competency: string;
 sourcePage: number; sourceVersion: string; sourceUrl: string; sourceLocator: string;
 methodology: string; methodologyPage: number; assessment: string | null;
 assessmentPage: number | null; prerequisites: null; period: null; officialLesson: null;
 coverage: 'PARTIAL'; contentKind: 'ANNUAL_SECTION_SUMMARY'; sequence: number;
}
const themes=['La maison','Le village, la ville','L’école','Les métiers','Les voyages','La santé','Les jeux','Les communications'];
const upperThemes=['La nature','Le village, la ville','L’école','Les métiers','Les voyages','La santé','Sports et loisirs','Dans l’espace'];
type Row=[page:number,objective:string];
const frRows: Record<string,Row[]>={
 'fr-primary-sil':[[67,'Distinguer collections et nombres 1–5.'],[68,'Composer des collections ; lire 6–9.'],[68,'Reconnaître et écrire zéro.'],[69,'Construire la dizaine.'],[69,'Lire 11–14 ; utiliser les doubles.'],[70,'Lire 15–17 ; trouver des moitiés.'],[70,'Lire 18–19 ; dénombrer un produit.'],[71,'Construire la vingtaine et des partages égaux.']],
 'fr-primary-cp':[[67,'Classer des collections ; lire 20–30.'],[68,'Représenter des ensembles ; lire 31–40.'],[68,'Réunir des ensembles ; lire 41–50.'],[69,'Lire 51–60 ; poser une addition.'],[69,'Lire 61–70 ; pratiquer la multiplication.'],[70,'Lire 71–80 ; doubler ou partager.'],[70,'Lire 81–90 ; utiliser des tables.'],[71,'Construire la centaine et représenter des fractions.']],
 'fr-primary-ce1':[[74,'Caractériser des ensembles ; lire 100–200.'],[75,'Décomposer 200–300 ; additionner et soustraire.'],[76,'Lire 300–500 ; exploiter les propriétés opératoires.'],[77,'Lire 500–700 ; multiplier par un chiffre.'],[78,'Placer 700–800 ; reconnaître les nombres pairs.'],[79,'Lire 800–900 ; identifier une fraction.'],[80,'Lire 900–1000 ; calculer triple et tiers.'],[81,'Décomposer quatre chiffres ; utiliser la calculatrice.']],
 'fr-primary-ce2':[[74,'Réunir des ensembles ; décomposer jusqu’à 2000.'],[75,'Décomposer jusqu’à 3000 ; calculer avec retenue.'],[76,'Lire jusqu’à 5000 ; utiliser l’associativité.'],[77,'Arrondir jusqu’à 7000 ; multiplier par deux chiffres.'],[78,'Placer jusqu’à 8000 ; distinguer pair et impair.'],[79,'Lire jusqu’à 9000 ; écrire des fractions.'],[80,'Lire jusqu’à 10000 ; calculer quadruple et quart.'],[81,'Décomposer cinq chiffres ; calculer avec un instrument.']],
 'fr-primary-cm1':[[71,'Représenter des ensembles ; additionner les grands nombres.'],[72,'Arrondir les entiers ; estimer un produit.'],[73,'Ordonner les décimaux ; calculer leurs sommes.'],[74,'Encadrer des décimaux ; nommer des fractions.'],[75,'Simplifier et multiplier des fractions.'],[76,''],[76,'Calculer une durée et une distance de trajet.'],[77,'Relier achats, ventes, gains et pertes.']],
 'fr-primary-cm2':[[71,'Déterminer un cardinal ; calculer avec les entiers.'],[72,'Interpréter des diagrammes ; arrondir les entiers.'],[73,'Comparer les décimaux ; multiplier deux décimaux.'],[74,'Relier décimaux et fractions ; effectuer des divisions.'],[75,'Ordonner les fractions ; effectuer leurs divisions.'],[76,''],[76,'Calculer un trajet traversant deux jours consécutifs.'],[77,'Calculer prix, coût, bénéfice ou perte.']],
};
const enDomains=['Sets and logic','Numbers and operations','Measurement and size','Geometry and space','Graphs and statistics'];
const enRows:Record<string,Row[]>={
 'en-primary-1':[[48,'Sort objects by their features.'],[48,'Connect quantities, numerals and operations through 100.'],[49,'Relate days, activities and money through 100 francs.'],[49,'Build shape patterns and locate points through 20.'],[50,'Organise data, order values and tally in twos/threes.']],
 'en-primary-2':[[48,'Classify by three attributes; represent sets.'],[48,'Use numbers 100–200 and place value.'],[49,'Compare dimensions; read clocks and manage 200 francs.'],[49,'Construct shapes and locate points through 50.'],[50,'Graph data and tally in fours/fives.']],
 'en-primary-3':[[49,'Distinguish set types and their symbols.'],[49,'Count through 500 and identify operation symbols.'],[50,'Describe measurements; read time and manage 1000 francs.'],[51,'Identify circle parts and locate points through 30.'],[51,'Represent data and interpret map positions.']],
 'en-primary-4':[[49,'Describe set union, intersection and equivalence.'],[49,'Calculate through 5000; combine fractions and operations.'],[50,'Convert measures; calculate areas and manage 5000 francs.'],[51,'Distinguish parallel lines; measure angles.'],[51,'Represent data, coordinates and ordered values.']],
 'en-primary-5':[[50,'Describe and represent different set relationships.'],[50,'Use proportion and interest; calculate with numbers.'],[51,'Convert measures; relate distance, time and speed.'],[52,'Measure angles and construct geometric models.'],[52,'Represent data and interpret coordinates.']],
 'en-primary-6':[[50,'Solve and represent set problems.'],[51,'Use place value, factors, multiples and fractions.'],[51,'Compare measures, journey times and commercial quantities.'],[52,'Construct models and measure angles.'],[52,'Interpret charts, coordinates and ordered data.']],
};
export const annualPrimarySourceCautions=[
 {documentId:'minedub-en-primary-2',pages:[49,51],status:'BLOCKED_SOURCE_CELLS',reason:'Class 3 numerical bounds vary between cells; 4 D shapes and the quadrilateral/pentagon grouping are not adopted. Only unambiguous outcomes are summarised.'},
 {documentId:'minedub-en-primary-3',pages:[52],status:'BLOCKED_SOURCE_CELLS',reason:'Isosceles is listed among angle types and 4 D shapes is unspecified. These cells are excluded, not silently corrected.'},
 {documentId:'minedub-fr-primary-2',pages:[74,77],status:'BLOCKED_SOURCE_CELLS',reason:'Certaines bornes numériques varient entre colonnes de savoirs et savoir-faire ; aucune harmonisation déduite.'},
 {documentId:'minedub-fr-primary-3',pages:[71,76],status:'PENDING_SOURCE',reason:'Bornes des grands nombres variables ; unité 6 « nombres complexes » non définie dans cet extrait. Aucun sens algébrique ni sexagésimal inventé ; unité exclue du contenu validé.'},
];
export const annualPrimarySections:AnnualPrimarySection[]=Object.entries({...frRows,...enRows}).flatMap(([level,rows])=>{
 const language=level.startsWith('fr-')?'fr':'en';
 const n=language==='en'?Math.ceil(Number(level.split('-').at(-1))/2):level.endsWith('sil')||level.endsWith('cp')?1:level.endsWith('ce1')||level.endsWith('ce2')?2:3;
 const source=minedubDocuments.find(d=>d.id===`minedub-${language}-primary-${n}`)!;
 return rows.flatMap(([page,objective],i)=>objective?[{
  id:`annual-math-v1-${level}-${i+1}`,catalogLevelId:level,documentId:source.id,language,
  theme:language==='fr'?(n===3?upperThemes:themes)[i]:enDomains[i],domain:language==='fr'?'Nombres et calculs':enDomains[i],objective,
  competency:language==='fr'?'Mobiliser nombres et calculs dans une situation courante.':objective,
  sourcePage:page,sourceVersion:source.sha,sourceUrl:'https://www.minedub.cm/download/350/archives/'+source.download,
  sourceLocator:`PDF ${page} — ${language==='fr'?'colonne '+level.split('-').at(-1)?.toUpperCase()+', unité '+(i+1):'Table 21, Class '+level.split('-').at(-1)}`,
  methodology:language==='fr'?'Manipulation, résolution de problèmes et justification des démarches.':(n===1&&page===48?'Cooperative activities, matching and demonstration.':n===2&&i===3?'Practical projects and cooperative practice.':'Practical activities and cooperative learning.'),
  methodologyPage:language==='fr'?(n===1?66:n===2?73:70):page,
  assessment:language==='fr'?'Vérifier cohérence du raisonnement et exactitude de la réponse.':null,assessmentPage:language==='fr'?(n===1?65:n===2?73:69):null,
  prerequisites:null,period:null,officialLesson:null,coverage:'PARTIAL' as const,contentKind:'ANNUAL_SECTION_SUMMARY' as const,sequence:i+1,
 }]:[]);
});
