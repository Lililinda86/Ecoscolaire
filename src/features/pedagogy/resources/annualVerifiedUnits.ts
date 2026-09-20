import { closureVerifiedUnits, closureVerifiedScopes } from './annualClosurePrimary';
import { subjectMappingSources } from '../../../../functions/src/pedagogy/subjectMappingSources';
const source=subjectMappingSources.find(s=>s.documentId==='minedub-fr-primary-2')!;
const themes=['La maison','Le village, la ville','L’école','Les métiers','Les voyages','La santé','Les jeux','Les communications'];
export interface AnnualVerifiedUnit {id:string;catalogLevelId:string;subjectName:string;title:string;theme:string;objective:string;competency:string;activity:string;assessment:string;methodology:string;sourcePages:number[];sourceLocator:string;sourceVersion:string;sourceUrl:string;documentId:string;officialLesson:null;calendarPeriod:null}
const eps=(level:string):AnnualVerifiedUnit[]=>{
 const ce2=level.endsWith('ce2');
 const rows:Array<[number,number,string,string]>=[
 [1,152,'Course et récupération',ce2?'Travailler le départ sur 40 m, maintenir la vitesse sur 5 secondes, varier une allure aisée et récupérer entre deux passages.':'Travailler le départ sur 20 m, adapter une allure aisée sur 50 à 70 m et récupérer entre deux passages.'],
 [2,153,'Lancer et franchissement','Prendre en main un engin adapté, orienter sa trajectoire et respecter le règlement ; coordonner élan, impulsion des jambes et mouvement des bras au saut.'],
 [3,153,'Gymnastique au sol','Varier les appuis des mains et des pieds et composer un enchaînement de trois ou quatre éléments.'+(ce2?' Maintenir des postures stables.':'')],
 [4,154,'Football','Situer l’origine et les principes du jeu ; se placer, conserver, passer, recevoir et récupérer le ballon selon les règles élémentaires.'],
 [5,154,'Handball','Situer l’origine et les principes du jeu ; adapter placement, conservation, réception, récupération et passe aux règles élémentaires.'],
 [6,155,'Basketball','Expliquer les principes et l’origine du jeu, ajuster placement et déplacements, passer et recevoir, protéger ou récupérer le ballon dans le respect des règles.'],
 [7,155,'Volleyball','Identifier origine, principes et règles de base ; adapter placement, déplacements, passes, réception et récupération du ballon au jeu collectif.'],
 [8,155,'Communication sportive','Expliquer les échanges utiles avec les partenaires et l’encadrant ; coopérer et respecter les autres pendant l’activité.'],
 ...[1,2,3].map(n=>[n,156,'Autodéfense : mise en situation','Reconnaître une feinte dans une simulation et découvrir les principes de dégagement d’une main et de protection. Préparation encadrée indispensable.'] as [number,number,string,string]),
 ];
 return rows.map(([unit,page,title,objective],i)=>({id:`annual-verified-${level}-eps-${i+1}`,catalogLevelId:level,subjectName:'Éducation physique et sportive',title,theme:themes[unit-1],objective,competency:i<3?'Mobiliser son corps dans une pratique individuelle contrôlée.':i<8?'Coopérer et communiquer dans une activité sportive collective.':'Comprendre des principes élémentaires de protection.',activity:objective,assessment:'Observer le respect des consignes et des autres, la pertinence des actions, les gestes de communication et le vocabulaire utilisé ; valoriser la coopération.',methodology:'Organiser des situations progressives, adaptées aux possibilités, au matériel, aux partenaires et aux conditions du milieu. Les techniques physiques exigent un encadrement adapté ; aucune mise en danger ne découle de cet index.',sourcePages:[page,151],sourceLocator:`PDF p. ${page}, tableau ${i<3?51:i<8?52:53}, unité ${unit}, colonne ${ce2?'CE2':'CE1'} ; démarche et évaluation p. 151. Section complète pp. 149–156, section suivante p. 157.`,sourceVersion:source.sourceVersion,sourceUrl:source.sourceUrl,documentId:source.documentId,officialLesson:null,calendarPeriod:null}));
};
const environmentalRows:Array<[number,string,string]>=[
 [106,'Énergie à la maison','Expliquer comment limiter la consommation d’énergie des appareils domestiques.'],
 [106,'Milieux, pollution et saisons','Distinguer les habitats des êtres vivants, reconnaître des facteurs de pollution et comparer les arbres selon la saison.'],
 [107,'Comprendre le réchauffement','Décrire le réchauffement climatique et identifier ses causes.'],
 [107,'Activités humaines et environnement','Analyser les effets des activités humaines sur le milieu et relier certaines actions aux causes du réchauffement.'],
 [107,'Aires protégées','Expliquer ce qu’est une aire protégée, les raisons de sa protection et les moyens employés.'],
];
export const annualVerifiedUnits:AnnualVerifiedUnit[]=[...eps('fr-primary-ce1'),...eps('fr-primary-ce2'),...environmentalRows.map(([page,title,objective],i)=>({id:`annual-verified-fr-primary-ce1-environment-${i+1}`,catalogLevelId:'fr-primary-ce1',subjectName:'Éducation à l’environnement et au développement durable',title,theme:themes[i],objective,competency:'Mobiliser ses observations pour préserver les milieux de vie.',activity:objective,assessment:'Examiner la pertinence de la démarche, des explications et du vocabulaire, l’adéquation à la consigne, la sécurité et la coopération.',methodology:'Partir d’une situation observée, recueillir les idées, conduire une recherche ou investigation puis confronter les résultats ; alterner travail individuel et collectif.',sourcePages:[page,93,94,105],sourceLocator:`PDF p. ${page}, tableau 28, unité ${i+1}, colonne CE1. Sous-domaine 3.5.6 pp. 105–107 ; section suivante p. 108. Évaluation p. 93, démarche pp. 94 et 105.`,sourceVersion:source.sourceVersion,sourceUrl:source.sourceUrl,documentId:source.documentId,officialLesson:null,calendarPeriod:null}))];
export const annualVerifiedScopes=[{catalogLevelId:'fr-primary-ce1',subjectName:'Éducation physique et sportive'},{catalogLevelId:'fr-primary-ce2',subjectName:'Éducation physique et sportive'},{catalogLevelId:'fr-primary-ce1',subjectName:'Éducation à l’environnement et au développement durable'}];

annualVerifiedUnits.push(...closureVerifiedUnits);
annualVerifiedScopes.push(...closureVerifiedScopes);
