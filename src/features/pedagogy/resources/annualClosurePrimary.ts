import { subjectMappingSources } from '../../../../functions/src/pedagogy/subjectMappingSources';
import type { AnnualVerifiedUnit } from './annualVerifiedUnits';

// Original summaries of the exact CP column, not a weekly timetable or local adoption.
const source = subjectMappingSources.find(s => s.documentId === 'minedub-fr-primary-1')!;
const themes = ['La maison', 'Le village, la ville', 'L’école', 'Les métiers', 'Les voyages', 'La santé', 'Les jeux', 'Les communications'];
type Row = [number, number, string, string];
const english: Row[] = [
  [1,44,'Écouter et parler : maison','Saluer et répondre, nommer les parties de la maison et leurs usages, se présenter et présenter une autre personne.'],
  [2,44,'Écouter et parler : ville','Nommer les éléments de la ville et décrire les activités qui s’y déroulent.'],
  [3,45,'Écouter et parler : école','Se présenter et présenter ses parents, échanger des salutations, former et prononcer des mots à partir des sons, décrire les activités de la semaine et suivre une consigne.'],
  [4,45,'Écouter et parler : métiers','Décrire oralement une profession et ses activités.'],
  [5,46,'Écouter et parler : voyage','Réciter une comptine et compter des objets ou personnes de 21 à 40.'],
  [6,46,'Écouter et parler : santé','Décrire une maladie dans une activité de langue et compter de 41 à 60.'],
  [7,46,'Écouter et parler : jeux','Nommer et décrire les activités d’un jeu ; compter de 61 à 80.'],
  [8,46,'Écouter et parler : communication','Nommer les moyens de communication et expliquer leur usage ; compter de 81 à 100.'],
  [1,47,'Lire : maison','Interpréter une image d’objets domestiques puis lire à voix haute le texte qui la décrit.'],
  [2,47,'Lire : ville','Lire des phrases sur la ville ou le village, reconnaître les lettres, lire mots fréquents et courts textes, épeler des mots.'],
  [3,48,'Lire : école','Lire des phrases sur la classe, des mots fréquents, les jours et une description des activités de la semaine ; répondre aux questions.'],
  [4,48,'Lire : métiers','Lire une description de métier, des mots fréquents et un court texte ; épeler les mots rencontrés.'],
  [5,48,'Lire : voyage','Lire les moyens de déplacement et le récit d’un court voyage ; lire les nombres de 20 à 40.'],
  [6,49,'Lire : santé','Lire le nom et la description d’une maladie, les mots fréquents et les nombres de 41 à 60.'],
  [7,49,'Lire : jeux','Lire le nom et une courte description d’un jeu ainsi que les nombres de 61 à 80.'],
  [8,49,'Lire : communication','Lire les moyens de communication et les nombres de 81 à 100.'],
  [1,50,'Écrire : maison','Tracer lisiblement les lettres de l’alphabet et copier des phrases simples.'],
  [2,50,'Écrire : ville','Copier les noms d’éléments de la ville et des phrases simples.'],
  [3,50,'Écrire : école','Écrire le nom des objets utilisés à l’école.'],
  [4,50,'Écrire : métiers','Copier le nom de différentes professions.'],
  [5,51,'Écrire : voyage','Écrire les nombres de 20 à 40, les objets du voyage et copier des phrases relatives à un déplacement.'],
  [6,51,'Écrire : santé','Écrire lisiblement les nombres de 41 à 60 et le nom des maladies étudiées en langue.'],
  [7,51,'Écrire : jeux','Écrire les nombres de 61 à 80 et les noms de jeux.'],
  [8,51,'Écrire : communication','Écrire les nombres de 81 à 100 et les moyens de communication.'],
  [1,52,'Langue : maison','Employer les contraires de mots d’une ou deux syllabes et les pluriels des noms en s et es.'],
  [2,52,'Langue : ville','Employer en contexte les contraires de mots d’une ou deux syllabes.'],
  [3,52,'Langue : école','Employer les contraires ; construire des phrases au présent, au passé simple anglais et au futur simple avec des verbes réguliers.'],
  [4,53,'Langue : métiers','Employer les contraires et décrire personnes, lieux et objets avec des adjectifs d’une syllabe ; repérer les comparatifs mentionnés dans la cellule de connaissances.'],
  [5,53,'Langue : voyage','Employer les contraires et décrire un mouvement avec des adverbes.'],
  [6,53,'Langue : santé','Employer les contraires et des pronoms démonstratifs pour indiquer la proximité.'],
  [7,54,'Langue : jeux','Employer les contraires, situer des objets avec des prépositions et relier mots, groupes et phrases par coordination.'],
  [8,54,'Langue : communication','Employer les contraires et utiliser les interjections de salutation en contexte.'],
];
const arts: Row[] = [
  [1,114,'Arts visuels : couleurs et outils','Colorier une figure et choisir différents outils de dessin pour réaliser une production plastique.'],
  [2,114,'Arts visuels : patrimoine','Comparer des objets artistiques appartenant à un même registre.'],
  [3,114,'Arts visuels : lignes','Tracer des lignes droites, courbes et brisées.'],
  [7,114,'Arts visuels : formes','Dessiner des formes régulières et irrégulières.'],
  [2,115,'Musique : instruments et artistes','Produire des sons avec des instruments locaux et nommer des artistes de sa localité ou du pays.'],
  [3,116,'Musique : cadence et notes','Marquer une cadence avec le corps et représenter les sept notes avec les clés.'],
  [4,116,'Musique : mesure','Identifier les temps dans la mesure d’un chant.'],
  [3,117,'Théâtre : imitation','Imiter voix et gestes et interpréter un personnage dans une courte scène.'],
  [7,117,'Théâtre : coopération','Coopérer avec les autres dans une pièce ou une saynète.'],
  [7,117,'Danse','Distinguer une danse traditionnelle d’une danse moderne et en exécuter une.'],
];
function units(rows: Row[], subjectName: string, kind: 'english'|'arts'): AnnualVerifiedUnit[] {
  return rows.map(([unit,page,title,objective],i) => ({
    id:`annual-closure-fr-primary-cp-${kind}-${i+1}`,catalogLevelId:'fr-primary-cp',subjectName,
    title,theme:themes[unit-1],objective,
    competency:kind==='english'?'Communiquer en anglais à l’oral et à l’écrit dans une situation familière.':'Créer, interpréter et apprécier des productions artistiques en coopération.',
    activity:kind==='english'?'Proposition Ecoscolaire : partir d’images ou d’objets familiers, réaliser la tâche décrite, puis la reprendre dans un échange ou une production individuelle.':'Proposition Ecoscolaire : observer un modèle, essayer les gestes ou les outils, réaliser une production puis expliquer ses choix au groupe.',
    assessment:kind==='english'?'Vérifier séparément écoute et expression, lecture et écriture : sens de la réponse, intelligibilité, fluidité, lisibilité et usage des formes étudiées.':'Observer le respect de la consigne, le choix des outils, la créativité, la qualité de la réalisation et la coopération.',
    methodology:kind==='english'?'Démarche active contextualisée, diagnostic initial, oral puis lecture et écriture ; adapter les supports aux besoins des élèves.':'Ateliers pratiques et projets, exploration sensorielle et présentation des réalisations ; matériel adapté aux enfants.',
    sourcePages:[page,kind==='english'?42:113],
    sourceLocator:`PDF p. ${page}, tableau ${kind==='english'?(i<8?9:i<16?10:i<24?11:12):(i<4?35:i<7?36:i<9?37:38)}, unité ${unit}, colonne CP. ${kind==='english'?'Section complète pp. 41–54 ; évaluation et démarche pp. 42–43 ; section suivante p. 55.':'Section complète pp. 112–117 ; évaluation p. 113 ; section suivante p. 118.'}`,
    sourceVersion:source.sourceVersion,sourceUrl:source.sourceUrl,documentId:source.documentId,
    officialLesson:null,calendarPeriod:null,
  }));
}
export const closureVerifiedUnits = [...units(english,'English language','english'),...units(arts,'Éducation artistique','arts')];
export const closureVerifiedScopes = [{catalogLevelId:'fr-primary-cp',subjectName:'English language'},{catalogLevelId:'fr-primary-cp',subjectName:'Éducation artistique'}];
