import { secondarySubjectSources } from '../../../../functions/src/pedagogy/secondarySubjectSources';
import type { AnnualGapUnit } from './annualGapContent';
type ModuleRow = [page: number, title: string];
type Scope = [document: string, level: string, rows: ModuleRow[]];
// Physical PDF pages, manually checked against level headings. This is an index,
// not a set of completed lessons; null learning fields remain visibly pending.
const scopes: Scope[] = [
 ['40','fr-secondary-6e',[[17,'Civilisations anciennes africaines'],[24,'Civilisations anciennes européennes et asiatiques'],[26,'Religions monothéistes et héritages']]],
 ['40','fr-secondary-5e',[[30,'Peuplement et organisation du Cameroun'],[35,'Rayonnement historique de l’Afrique'],[38,'Relations de l’Afrique avec le monde']]],
 ['39','fr-secondary-6e',[[16,'La Terre dans l’Univers'],[20,'Préservation de l’environnement'],[22,'Risques naturels']]],
 ['39','fr-secondary-5e',[[25,'L’homme et son milieu'],[30,'Occupation du milieu']]],
 ['38','fr-secondary-6e',[[17,'Vie familiale et scolaire'],[21,'Gestion des conflits'],[24,'Respect de la personne humaine']]],
 ['38','fr-secondary-5e',[[26,'Intégration nationale'],[29,'Lieux d’intégration'],[33,'Mass-médias']]],
 ['55','fr-secondary-4e',[[18,'Esclavage et traite'],[20,'Migrations africaines'],[22,'Regroupements politiques africains au XIXe siècle'],[24,'Europe des XVIIIe et XIXe siècles']]],
 ['55','fr-secondary-3e',[[26,'Impérialismes'],[28,'Crises et guerres du XXe siècle'],[30,'Décolonisation'],[32,'Du Kamerun à la République du Cameroun']]],
 ['54','fr-secondary-4e',[[18,'Diversité physique et humaine africaine'],[22,'Économie africaine'],[25,'CEMAC']]],
 ['54','fr-secondary-3e',[[28,'Milieux géographiques camerounais'],[31,'Population camerounaise'],[33,'Activités économiques'],[37,'Lutte contre la pauvreté'],[39,'Échanges mondiaux']]],
 ['53','fr-secondary-4e',[[33,'Fonctionnement de l’État camerounais'],[37,'Dérives sociales']]],
 ['53','fr-secondary-3e',[[40,'Démocratie'],[43,'Associations'],[46,'Vie économique']]],
 ['43','fr-secondary-4e',[[19,'Arts scéniques I'],[22,'Arts plastiques I'],[25,'Arts musicaux I']]],
 ['43','fr-secondary-3e',[[27,'Arts scéniques II'],[30,'Arts plastiques II'],[33,'Arts musicaux II']]],
 ['42','fr-secondary-4e',[[19,'Social integration and traditions'],[22,'Professional future and leisure'],[25,'Environment and health'],[28,'Gender and mutual acceptance'],[31,'ICT communication']]],
 ['42','fr-secondary-3e',[[43,'National integration and diversity'],[46,'Consumption and society'],[49,'Climate, hygiene and sanitation'],[52,'Excellence, gender and democracy'],[55,'Uses of technology']]],
 ['44','fr-secondary-4e',[[20,'Vie familiale et socioculturelle'],[21,'Citoyenneté et environnement'],[22,'Vie économique'],[23,'Bien-être et santé'],[24,'Médias et communication']]],
 ['44','fr-secondary-3e',[[20,'Vie familiale et socioculturelle'],[21,'Citoyenneté et environnement'],[22,'Vie économique'],[23,'Bien-être et santé'],[24,'Médias et communication']]],
 ['72','en-secondary-form3',[[35,'School environment'],[37,'Family and its environment'],[40,'Administrative organisation of Cameroon']]],
 ['72','en-secondary-form4',[[42,'Political organisation of Cameroon'],[45,'Social issues'],[47,'Citizenship and the economy']]],
 ['72','en-secondary-form5',[[49,'Human rights'],[51,'Peace and conflict resolution'],[53,'Gender and minority rights'],[55,'Global concerns']]],
 ['75','en-secondary-form3',[[36,'European activity and colonisation in Africa'],[43,'First World War and its consequences']]],
 ['75','en-secondary-form4',[[47,'Second World War'],[50,'Independence'],[52,'Reunification']]],
 ['75','en-secondary-form5',[[54,'Decolonisation and instability'],[57,'Economic development and regional integration'],[59,'International relations and organisations']]],
 ['73','en-secondary-form3',[[36,'Resource allocation'],[38,'Resources in production'],[42,'Distribution of goods and services']]],
 ['73','en-secondary-form4',[[43,'Business units'],[47,'Population and resources'],[50,'Market interaction'],[54,'Competition']]],
 ['73','en-secondary-form5',[[55,'Financial operations'],[59,'Public finance'],[61,'International trade'],[64,'National income'],[65,'Development and employment']]],
 ['74','en-secondary-form3',[[36,'Earth in the universe'],[40,'Natural processes and hazards'],[50,'Weather and climate']]],
 ['74','en-secondary-form4',[[54,'Ecological systems and resources'],[60,'Poverty and development']]],
 ['74','en-secondary-form5',[[71,'Poverty and development']]],
 ['69','en-secondary-form3',[[21,'Living world'],[25,'Health education'],[27,'Environment and sustainable development']]],
 ['69','en-secondary-form4',[[30,'Living world'],[34,'Health education'],[39,'Environment and sustainable development']]],
 ['69','en-secondary-form5',[[43,'Living world'],[48,'Health education'],[53,'Environment and sustainable development']]],
 ['71','en-secondary-form4',[[17,'Living world — human biology'],[21,'Health education'],[30,'Environment and sustainable development']]],
 ['71','en-secondary-form5',[[35,'Living world — human biology'],[40,'Health education'],[45,'Environment and sustainable development']]],
 ['70','en-secondary-form4',[[17,'Internal geodynamic processes'],[23,'External geodynamic processes'],[25,'Applied and environmental geology']]],
 ['70','en-secondary-form5',[[29,'Internal geodynamic processes'],[32,'External geodynamic processes'],[35,'Applied and environmental geology']]],
 ['2','en-secondary-form1',[[18,'Computing environment'],[18,'Hardware, software and basic concepts']]],
 ['2','en-secondary-form2',[[18,'Organising and using computer resources'],[18,'Searching and communicating online']]],
 ['59','en-secondary-form3',[[18,'Operating systems and networks'],[18,'Applications and algorithms']]],
 ['59','en-secondary-form4',[[18,'Hardware and maintenance'],[18,'Number systems and software tools']]],
 ['59','en-secondary-form5',[[18,'Information systems and data'],[18,'Technology, society and people'],[18,'Software development projects']]],
];
for (const [level,pages] of [['en-secondary-form3',[24,26,28,30,32]],['en-secondary-form4',[35,37,39,41,43]],['en-secondary-form5',[46,48,50,52,54]]] as const) {
 scopes.push(['57',level,pages.map((p,i)=>[p,['Vie familiale et intégration','Environnement et santé','Citoyenneté et ouverture','Économie et travail','Communication et TIC'][i]])]);
}
export const secondaryGapUnits: AnnualGapUnit[] = scopes.flatMap(([document,level,rows])=>{
 const source=secondarySubjectSources.find(s=>s.catalogLevelId===level)?.subjects.find(s=>s.sources.some(d=>d.documentId==='minesec-'+document));
 if(!source) throw new Error('Unmatched secondary scope '+document+'/'+level);
 const doc=source.sources.find(s=>s.documentId==='minesec-'+document)!;
 return rows.map(([page,title],i)=>({id:`annual-gap-v1-${level}-${document}-${i+1}`,catalogLevelId:level,sourceDocumentId:doc.documentId,sourceVersion:doc.sourceVersion,sourceUrl:doc.sourceUrl,sourcePages:[page],sourceLocator:`PDF ${page}; module index; ${doc.locator}`,subjectName:source.officialSubject,title,themes:[title],objective:null,competency:null,methodology:null,assessment:null,period:null,coverage:'PARTIAL' as const,contentKind:'LOCATED_MODULE_INDEX' as const,sourceScope:'LOCATED_MODULE_NOT_COMPLETE_LESSON',officialLesson:null,activity:null}));
});
// Located competence/action summaries, kept separate from the unextracted lesson details.
for (const unit of secondaryGapUnits) {
 const i=Number(unit.id.split('-').at(-1))-1;
 if(unit.sourceDocumentId==='minesec-44') {
  const pages=unit.catalogLevelId.endsWith('4e')?[26,28,30,32,34]:[37,39,41,43,45];
  unit.sourcePages.push(pages[i]); unit.sourceLocator+=`; tableau de classe PDF ${pages[i]}`;
  unit.objective=['Rendre compte d’une activité sociale et exprimer un point de vue.','Lire des informations et décrire une situation environnementale ou citoyenne.','Lire des étiquettes et échanger des informations dans une situation économique.','Comprendre et transmettre des informations relatives au bien-être.','Lire et produire un message adapté au média utilisé.'][i];
  unit.competency='Mobiliser lecture, écriture et échanges oraux dans le contexte du module.';
  unit.activity=['Compte rendu oral ou écrit d’une activité socioculturelle.','Description d’un phénomène environnemental.','Lecture comparative d’étiquettes et préparation d’une liste d’achats.','Dialogue pour demander ou transmettre une information de santé, sans diagnostic.','Rédaction d’un courriel ou d’un court article.'][i];
  unit.contentKind='DOCUMENTARY_MODULE_SUMMARY';
 }
 if(unit.sourceDocumentId==='minesec-57') {
  unit.objective=['Échanger des informations sur la vie familiale et communautaire.','Demander ou transmettre des informations sur l’environnement et la santé.','Lire et échanger sur les droits, règles et institutions.','Interagir oralement et par écrit dans une situation d’achat ou de travail.','Comprendre et produire des messages à l’aide des moyens de communication.'][i];
  unit.competency='Utiliser écoute, expression orale, lecture et écriture en français dans une situation de vie.';
  if(i===4)unit.activity=unit.catalogLevelId.endsWith('3')?'Lire puis rédiger un court SMS.':unit.catalogLevelId.endsWith('4')?'Lire et rédiger un courriel.':'Présenter un compte rendu d’émission et discuter les usages des TIC.';
  unit.contentKind='DOCUMENTARY_MODULE_SUMMARY';
 }
}
const openingGoals:Record<string,[string,string]>={
 'fr-secondary-6e-40':['Relier les civilisations actuelles aux héritages africains anciens.','Comprendre des héritages historiques pour situer son identité.'],
 'fr-secondary-5e-40':['Découvrir les civilisations traditionnelles du Cameroun.','Relier leur organisation à la compréhension de la société camerounaise.'],
 'fr-secondary-6e-39':['Décrire la Terre et ses mouvements.','Relier les cycles naturels aux activités humaines.'],
 'fr-secondary-5e-39':['Décrire population et activités agropastorales selon les milieux.','Raisonner sur une utilisation responsable des ressources locales.'],
 'fr-secondary-6e-38':['Identifier ses responsabilités dans la famille et à l’école.','Participer de manière responsable à la vie familiale et scolaire.'],
 'fr-secondary-5e-38':['Reconnaître les facteurs de l’intégration nationale.','Contribuer au vivre-ensemble dans la communauté.'],
 'fr-secondary-4e-55':['Comprendre les violences de la traite et les résistances africaines.','Relier l’étude historique au respect des libertés fondamentales.'],
 'fr-secondary-3e-55':['Expliquer le partage colonial et les réactions africaines.','Analyser la domination en mobilisant des connaissances historiques.'],
 'fr-secondary-4e-54':['Localiser l’Afrique et décrire sa diversité physique et humaine.','Mobiliser ces repères pour comprendre la valorisation des milieux.'],
 'fr-secondary-3e-54':['Identifier les milieux naturels camerounais et leurs menaces.','Raisonner sur leur protection et leur aménagement durable.'],
 'fr-secondary-4e-53':['Décrire les pouvoirs et le fonctionnement de l’État camerounais.','Comprendre les institutions et la participation citoyenne.'],
 'fr-secondary-3e-53':['Découvrir les bases démocratiques et le système électoral.','Mobiliser une culture démocratique dans la vie sociale.'],
 'fr-secondary-4e-43':['Mémoriser et interpréter une courte scène et produire un texte théâtral.','S’exprimer devant un public par une prestation scénique.'],
 'fr-secondary-3e-43':['Produire et interpréter un court texte théâtral comique.','Participer à une animation culturelle et s’exprimer devant un public.'],
 'fr-secondary-4e-42':['Discuss customs and conflict resolution in English.','Communicate with tolerance in situations of social integration.'],
 'fr-secondary-3e-42':['Discuss national integration and acceptance of diversity.','Use English to cooperate and express views with tolerance.'],
 'en-secondary-form3-72':['Identify responsibilities within the school community.','Build constructive relationships with peers and school authorities.'],
 'en-secondary-form4-72':['Understand political authority and democratic practices in Cameroon.','Use civic knowledge to participate in public life.'],
 'en-secondary-form5-72':['Understand personal rights and respect the rights of others.','Apply human-rights awareness to social situations.'],
 'en-secondary-form3-75':['Explain how European activities led to colonial domination in Africa.','Use historical knowledge to analyse relations of domination.'],
 'en-secondary-form4-75':['Relate the Second World War to African nationalist movements.','Identify actors and developments in African liberation.'],
 'en-secondary-form5-75':['Describe decolonisation and post-independence instability.','Interpret African socio-political developments after World War II.'],
 'en-secondary-form3-73':['Understand basic economic concepts and allocation of scarce resources.','Reason about allocating resources among competing uses.'],
 'en-secondary-form4-73':['Describe the firm and its economic environment.','Use basic entrepreneurial knowledge in local economic situations.'],
 'en-secondary-form5-73':['Explain the functions of money and financial institutions.','Understand their roles in exchanges of goods and services.'],
 'en-secondary-form3-74':['Relate Earth–Sun relationships to daily and seasonal variation.','Explain environmental differences using geographical observation.'],
 'en-secondary-form4-74':['Understand interactions within ecological systems.','Analyse resource use and ways to protect the environment.'],
 'en-secondary-form5-74':['Identify causes of poverty and development challenges.','Analyse development strategies and resource management in Cameroon.'],
 'en-secondary-form3-69':['Understand living systems, their diversity and resource uses.','Relate life processes to conservation and food production.'],
 'en-secondary-form4-69':['Explain nutritional requirements and food production in plants and animals.','Use examples to explain energy and matter in living systems.'],
 'en-secondary-form5-69':['Explore reproduction, biotechnology, coordination and genetic variation.','Relate living processes to concrete biological situations.'],
 'en-secondary-form4-71':['Study food classes, nutrition and the role of enzymes.','Explain human nutritional requirements using biological knowledge.'],
 'en-secondary-form5-71':['Relate cells, food hygiene and genetic variation to human life.','Use biological concepts to interpret everyday human needs.'],
 'en-secondary-form4-70':['Identify solar-system, earthquake and volcanic processes.','Use geological knowledge to explain environmental phenomena.'],
 'en-secondary-form5-70':['Study deformation, geological structures and plate movements.','Explain geological phenomena using structural and tectonic concepts.'],
 'en-secondary-form1-2':['Identify the computing environment and its resources.','Use basic computing concepts to understand digital tools.'],
 'en-secondary-form2-2':['Organise, select and use computer resources.','Choose computing resources for a defined information task.'],
 'en-secondary-form3-59':['Explore operating systems and network platforms.','Use system and network concepts in computing situations.'],
 'en-secondary-form4-59':['Understand hardware systems and maintenance.','Apply hardware knowledge to responsible system use.'],
 'en-secondary-form5-59':['Understand information systems and data-resource management.','Relate data organisation to information-system needs.'],
};
for(const unit of secondaryGapUnits){const goal=openingGoals[unit.catalogLevelId+'-'+unit.sourceDocumentId.replace('minesec-','')];if(!goal||!unit.id.endsWith('-1'))continue;
 unit.objective=goal[0];unit.competency=goal[1];unit.contentKind='DOCUMENTARY_MODULE_SUMMARY';
 if(unit.sourceDocumentId==='minesec-43'){unit.sourcePages.push(unit.catalogLevelId.endsWith('4e')?20:28);unit.sourceLocator+='; compétences sur la page suivante';}
}
const scienceOpenings:Array<[string,string,number[],string,string,string]>=[
 ['5','en-secondary-form1',[19,20],'Living world — shared introductory framework','Identify living systems and ecological relationships.','Relate biological knowledge to sustainable use of plant and animal resources.'],
 ['5','en-secondary-form2',[19,20],'Living world — shared introductory framework','Identify living systems and ecological relationships.','Relate biological knowledge to sustainable use of plant and animal resources.'],
 ['10','en-secondary-form1',[21,22],'Scientific methods','Develop basic observation and scientific problem-solving skills.','Apply scientific processes to everyday environmental situations.'],
 ['10','en-secondary-form2',[30],'Scientific methods','Use scientific methods to understand resources and the environment.','Apply scientific knowledge to improve resource use in everyday situations.'],
 ['63','en-secondary-form3',[28],'Physical quantities and measurement','Identify and measure mass, volume, temperature and time.','Use measuring equipment and record values with appropriate units safely.'],
 ['63','en-secondary-form4',[38],'Heat and temperature','Distinguish heat and temperature and understand thermometer calibration.','Use temperature measurements to reason about thermal situations.'],
 ['63','en-secondary-form5',[48],'Magnetic fields','Identify magnetic poles, attraction and repulsion.','Use magnetic behaviour to distinguish materials and explain applications.'],
 ['37','fr-secondary-6e',[17,19],'Le monde vivant','Identifier les ressources vivantes et leurs usages.','Relier production végétale, production animale et gestion des ressources naturelles.'],
 ['37','fr-secondary-5e',[18,19],'Le monde vivant','Comprendre l’amélioration de la production végétale et animale.','Mobiliser des connaissances du vivant pour une utilisation responsable des ressources.'],
];
for(const [document,level,pages,title,objective,competency] of scienceOpenings){
 const source=secondarySubjectSources.find(s=>s.catalogLevelId===level)!.subjects.find(s=>s.sources.some(d=>d.documentId==='minesec-'+document))!;
 const doc=source.sources.find(d=>d.documentId==='minesec-'+document)!;
 secondaryGapUnits.push({id:`annual-gap-v1-${level}-${document}-opening`,catalogLevelId:level,sourceDocumentId:doc.documentId,sourceVersion:doc.sourceVersion,sourceUrl:doc.sourceUrl,sourcePages:pages,sourceLocator:`PDF ${pages.join(', ')}; ${doc.locator}`,subjectName:source.officialSubject,title,themes:[title],objective,competency,methodology:null,assessment:null,period:null,coverage:'PARTIAL',contentKind:'DOCUMENTARY_MODULE_SUMMARY',sourceScope:document==='5'?'SHARED_INTRODUCTION_NOT_CLASS_DETAIL':'LOCATED_MODULE_NOT_COMPLETE_LESSON',officialLesson:null,activity:null});
}
const optionalOpenings:Array<[string,string,number[],string,string,string,string]>=[
 ['46','fr-secondary-4e',[16,17],'Arabe : communication courante','Développer écoute, lecture et expression en arabe.','Interagir dans des situations familières avec une langue simple.','Objectifs communs 4e–3e ; détail par classe non extrait.'],
 ['46','fr-secondary-3e',[16,17],'Arabe : communication courante','Développer écoute, lecture et expression en arabe.','Interagir dans des situations familières avec une langue simple.','Objectifs communs 4e–3e ; détail par classe non extrait.'],
 ['47','fr-secondary-4e',[22],'Chinois : vie familiale et sociale','Découvrir les bases de la langue dans les situations familières.','Mobiliser des connaissances orales et écrites pour communiquer.','Présentation commune du module ; détail par classe non extrait.'],
 ['47','fr-secondary-3e',[22],'Chinois : vie familiale et sociale','Découvrir les bases de la langue dans les situations familières.','Mobiliser des connaissances orales et écrites pour communiquer.','Présentation commune du module ; détail par classe non extrait.'],
 ['48','fr-secondary-4e',[24],'Espagnol : contacts sociaux','Découvrir prononciation et vocabulaire des relations familières.','Communiquer dans son environnement familial et social.','Présentation commune du module ; détail par classe non extrait.'],
 ['48','fr-secondary-3e',[24],'Espagnol : contacts sociaux','Découvrir prononciation et vocabulaire des relations familières.','Communiquer dans son environnement familial et social.','Présentation commune du module ; détail par classe non extrait.'],
 ['51','fr-secondary-4e',[24],'Allemand : vie familiale et sociale','Acquérir un vocabulaire usuel pour les contacts sociaux.','Lire, écrire et échanger dans des situations familières.','Module de 4e uniquement.'],
 ['51','fr-secondary-3e',[35],'Allemand : vie familiale et sociale','Enrichir les moyens de communication dans les relations sociales.','Mobiliser la langue dans des interactions socioculturelles.','Module de 3e uniquement.'],
 ['49','fr-secondary-4e',[18],'Latin : vie familiale et sociale','Découvrir vocabulaire, traduction et culture antique.','Lire et traduire de courts textes dans un contexte familier.','Volet latin uniquement ; grec non structuré.'],
 ['49','fr-secondary-3e',[26,27],'Latin : vie économique','Enrichir le vocabulaire économique et les connaissances de la langue latine.','Lire et traduire de courts textes relatifs aux activités économiques.','Volet latin uniquement ; grec non structuré.'],
 ['144','fr-secondary-2nde',[3,4,5],'Éducation artistique : profil de sortie','Développer une pratique artistique et une culture des arts.','Mobiliser les ressources de la discipline artistique choisie.','Seconde A1–A4 ; profil de fin de cycle, pas objectif annuel intégral. Branche artistique à confirmer.'],
 ['146','fr-secondary-2nde',[3,5],'SVTEEHB : vivant, santé, environnement, biotechnologie','Construire une culture scientifique et pratiquer le raisonnement scientifique.','Relier les connaissances à la santé, aux ressources vivantes et à leur préservation.','Seconde C exclusivement ; série locale non établie.'],
 ['79','fr-secondary-2nde',[3,4],'Informatique : multimédia et réseaux sociaux','Identifier les ressources multimédias et les risques de communication en ligne.','Utiliser fichiers et réseaux sociaux de façon responsable.','Seconde A exclusivement ; ne pas fusionner avec la série C.'],
 ['80','fr-secondary-2nde',[3,4],'Informatique : infographie et communication numérique','Identifier les ressources et outils de traitement des images.','Traiter des contenus multimédias et communiquer de façon responsable.','Seconde C exclusivement ; ne pas fusionner avec la série A.'],
 ['195','fr-secondary-terminale',[11],'Informatique : protection des systèmes','Identifier les dangers et moyens de protection des équipements.','Choisir des dispositifs adaptés à la protection du matériel informatique.','Terminales A, ABI, SH, AC uniquement.'],
 ['196','fr-secondary-terminale',[11],'Informatique : tableur','Utiliser la mise en forme et les formules dans une feuille de calcul.','Organiser et protéger des données avec un tableur.','Terminales C, D, E uniquement.'],
 ['200','fr-secondary-terminale',[11,12],'Histoire : décolonisation et conflits','Étudier des processus d’indépendance et leurs acteurs.','Analyser les formes de lutte et de négociation dans la décolonisation.','Terminale ESG ; extrait, sans déduire la série locale.'],
 ['202','fr-secondary-terminale',[3,4],'Géographie : Cameroun et mondialisation','Comprendre les interactions entre sociétés, milieux et économie.','Analyser la place du Cameroun dans les échanges mondiaux.','Terminale ESG ; applicabilité locale à confirmer.'],
];
for(const [document,level,pages,title,objective,competency,scope] of optionalOpenings){
 const subject=secondarySubjectSources.find(s=>s.catalogLevelId===level)!.subjects.find(s=>s.sources.some(d=>d.documentId==='minesec-'+document))!;
 const doc=subject.sources.find(d=>d.documentId==='minesec-'+document)!;
 secondaryGapUnits.push({id:`annual-gap-v1-${level}-${document}-conditional`,catalogLevelId:level,sourceDocumentId:doc.documentId,sourceVersion:doc.sourceVersion,sourceUrl:doc.sourceUrl,sourcePages:pages,sourceLocator:`PDF ${pages.join(', ')}; ${doc.locator}`,subjectName:subject.officialSubject,title,themes:[title],objective,competency,methodology:null,assessment:null,period:null,coverage:'PARTIAL',contentKind:'DOCUMENTARY_MODULE_SUMMARY',sourceScope:scope+' Enseignement local non établi.',officialLesson:null,activity:null});
}
// Manually read from the authenticated scans, physical PDF page 9 (not OCR).
for(const level of ['en-secondary-lower-sixth','en-secondary-upper-sixth'])for(const document of ['289','290']){
 const subject=secondarySubjectSources.find(s=>s.catalogLevelId===level)!.subjects.find(s=>s.sources.some(d=>d.documentId==='minesec-'+document))!;
 const doc=subject.sources.find(d=>d.documentId==='minesec-'+document)!;
 const language=document==='289';
 secondaryGapUnits.push({id:`annual-gap-v1-${level}-${document}-shared`,catalogLevelId:level,sourceDocumentId:doc.documentId,sourceVersion:doc.sourceVersion,sourceUrl:doc.sourceUrl,sourcePages:[9],sourceLocator:'Physical PDF page 9, manually read from the authenticated scan.',subjectName:subject.officialSubject,title:language?'English Language — contextual communication':'Literature in English — interpreting literary expression',themes:language?['Listening','Speaking','Reading','Writing']:['Literary interpretation','Language effects','Personal response'],objective:language?'Develop communication skills in meaningful situations.':'Recognise how writers use language to create literary effects.',competency:language?'Adapt language to purpose, audience, context and culture.':'Present an informed personal response to literary language.',methodology:null,assessment:null,period:null,coverage:'PARTIAL',contentKind:'DISCIPLINARY_OVERVIEW',sourceScope:'Shared introductory framework for Lower and Upper Sixth; class-specific tables remain unstructured. Local teaching unconfirmed. English Language and Literature remain distinct.',officialLesson:null,activity:null});
}
