import { minedubDocuments } from './minedubVerified';
import { subjectMappingSources } from '../../../../functions/src/pedagogy/subjectMappingSources';

export interface AnnualGapUnit {
 id: string; catalogLevelId: string; sourceDocumentId: string; sourceVersion: string; sourceUrl: string;
 sourcePages: number[]; sourceLocator: string; subjectName: string; title: string; themes: string[];
 objective: string | null; competency: string | null; methodology: string | null; assessment: string | null;
 period: null; coverage: 'PARTIAL'; contentKind: 'DISCIPLINARY_OVERVIEW' | 'LOCATED_MODULE_INDEX' | 'DOCUMENTARY_MODULE_SUMMARY';
 sourceScope: string; officialLesson: null; activity: string | null;
}
// Paraphrases of the disciplinary introductions, NOT full lesson extraction.
// Their scope is the two-year level; neither class is assigned the other class's detailed outcomes.
const frGoals: Record<number, [string,string,string[]]> = {
 0:['Développer les échanges oraux, la lecture et la production écrite.','Mobiliser la langue française pour comprendre et communiquer.',['Expression orale','Lecture et littérature','Écriture','Étude de la langue']],
 1:['Développer écoute, expression orale, lecture et écriture en anglais.','Communiquer en anglais dans des situations contextualisées.',['Listening and speaking','Reading','Writing','Grammar and vocabulary']],
 2:['Utiliser une langue nationale et découvrir les pratiques culturelles.','Communiquer et construire une identité culturelle ouverte à la diversité.',['Communication orale','Culture nationale','Échanges et activités collectives']],
 4:['Observer le vivant, la matière et les objets techniques avec une démarche rigoureuse.','Mobiliser des notions scientifiques et technologiques pour comprendre des situations.',['Sciences de la vie','Matière','Technologie','Activités agropastorales','Environnement']],
 5:['Découvrir les outils numériques et leurs usages responsables.','Employer les concepts et outils TIC pour apprendre, communiquer et créer.',['Environnement informatique','Usages responsables','Santé et sécurité']],
 6:['Comprendre les relations sociales, les droits, les devoirs et les règles de vie.','Pratiquer des valeurs sociales et citoyennes dans son environnement.',['Vie collective','Droits et devoirs','Citoyenneté','Paix et sécurité']],
 7:['Apprécier, interpréter puis créer des productions artistiques.','Exprimer sa sensibilité par différentes pratiques artistiques.',['Arts visuels','Musique','Arts dramatiques','Danse']],
 8:['Développer des mouvements contrôlés et coordonnés.','Participer aux activités physiques et sportives pour une vie active.',['Activités athlétiques','Sports collectifs','Coordination corporelle']],
 9:['Mettre en pratique des apprentissages dans des réalisations manuelles.','Développer autonomie, initiative et créativité.',['Artisanat','Activités agropastorales','Vie domestique']],
};
const frStarts=[[23,42,56,65,80,96,101,113,119,125,134],[23,52,65,72,92,109,118,141,150,158,168],[23,47,60,68,90,111,125,155,168,179,191]];
const frLevels=[['sil','cp'],['ce1','ce2'],['cm1','cm2']];
const enGoals: Record<number,[number,string,string,string[]]> = {
 0:[26,'Listen for meaning, speak, read and write coherent messages.','Use English to understand and communicate ideas and feelings.',['Listening and speaking','Reading','Writing']],
 2:[29,'Observe the body and environment, and follow scientific procedures.','Explain observations and use scientific and technological tools responsibly.',['Health','Environment','Technology']],
 3:[30,'Écouter, s’exprimer, lire et écrire dans des situations quotidiennes.','Communiquer en français en tenant compte de la situation.',['Compréhension orale','Expression orale','Lecture','Production écrite']],
 4:[31,'Relate human activities to society and practise harmonious living.','Act with tolerance, citizenship and care for people and shared property.',['Citizenship','Human activities','Harmonious living']],
 5:[33,'Follow procedures to make useful objects and undertake home tasks.','Work resourcefully and collaboratively with materials and equipment.',['Production','Home management','Collaboration']],
 6:[34,'Create visual and performing works expressing ideas and feelings.','Use voice, body and materials for artistic expression.',['Visual arts','Performing arts']],
 7:[36,'Discover bodily movement and practise social skills through physical activity.','Participate in movement activities while respecting signals and rules.',['Body awareness','Movement','Cooperation']],
 8:[37,'Listen, speak, read and write in a national language and participate in cultural activities.','Communicate through a national language and engage with cultural practices.',['Oral communication','Reading and writing','Songs and cultural scenes']],
 9:[39,'Use ICT equipment and basic productivity tools with health and safety awareness.','Use digital tools responsibly and practise computational thinking.',['Equipment','Productivity tools','Safety','Computational thinking']],
};
export const primaryGapUnits: AnnualGapUnit[] = [];
for (let n=1;n<=3;n++) for(const language of ['fr','en'] as const) {
 const documentId=`minedub-${language}-primary-${n}`;
 const doc=minedubDocuments.find(d=>d.id===documentId)!;
 const source=subjectMappingSources.find(d=>d.documentId===documentId)!;
 const levels=language==='fr'?frLevels[n-1].map(l=>'fr-primary-'+l):[n*2-1,n*2].map(l=>'en-primary-'+l);
 const indexes=language==='fr'?Object.keys(frGoals).map(Number):Object.keys(enGoals).map(Number);
 for(const index of indexes) for(const level of levels) {
  const goal=language==='fr'?frGoals[index]:enGoals[index].slice(1) as [string,string,string[]];
  const page=language==='fr'?frStarts[n-1][index]-1:enGoals[index][0]-(n===1?0:1);
  const themes=[...goal[2]];
  if(language==='fr'&&index===6&&n>1)themes.push('Histoire','Géographie');
  if(language==='fr'&&index===5&&n>1)themes.push('Production numérique','Internet','Programmation élémentaire');
  primaryGapUnits.push({id:`annual-gap-v1-${level}-subject-${index}`,catalogLevelId:level,sourceDocumentId:documentId,sourceVersion:doc.sha,sourceUrl:'https://www.minedub.cm/download/350/archives/'+doc.download,sourcePages:[page],sourceLocator:`PDF ${page} — introduction/attentes disciplinaires du niveau ${n}; objectifs communs au niveau, pas une attribution des cellules de l’autre classe`,subjectName:source.names[index],title:source.names[index]+' — repères annuels du niveau',themes,objective:goal[0],competency:goal[1],methodology:null,assessment:null,period:null,coverage:'PARTIAL',contentKind:'DISCIPLINARY_OVERVIEW',sourceScope:`LEVEL_${n}_SHARED_OUTCOMES_NOT_COMPLETE_CLASS_SYLLABUS`,officialLesson:null,activity:null});
 }
}

