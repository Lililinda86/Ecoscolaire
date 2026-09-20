import { annualVerifiedScopes, annualVerifiedUnits } from './annualVerifiedUnits';
import { subjectMappingSources } from '../../../../functions/src/pedagogy/subjectMappingSources';
import { secondarySubjectSources } from '../../../../functions/src/pedagogy/secondarySubjectSources';
import { primaryGapUnits, type AnnualGapUnit } from './annualGapContent';
import { secondaryGapUnits } from './secondaryGapIndex';
import { annualPrimarySections } from './annualPrimarySections';
import { secondaryStructuredUnits } from './secondaryStructuredUnits';
import { earlyYearsAnnualPlans } from './earlyYearsAnnualPlans';
export type AnnualCoverageStatus='COMPLETE'|'ITALO_VALIDATED'|'PARTIAL_BLOCKING'|'PENDING_SOURCE'|'NOT_APPLICABLE';
export interface AnnualScope {
 id:string; catalogLevelId:string; subjectName:string; period:'YEAR';
 officialSource:Array<{id:string;url:string;version:string}>; structuredContent:string[];
 themes:string[]; units:number; lessonsActivities:number; objectives:number; competencies:number;
 coverageStatus:AnnualCoverageStatus; missingReason:string; applicability:string;
 validatedFor?:{schoolId:string;academicYearId:string;version:string}; moduleIndexCount:number; expectedBasis:string; documentaryUsable:boolean; assessmentGuidance:string[]; locators:string[];
}
export const annualGapUnits:AnnualGapUnit[]=[...primaryGapUnits,...secondaryGapUnits];
const slug=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const scopes:AnnualScope[]=[];
function add(level:string,subject:string,sources:AnnualScope['officialSource'],status:AnnualCoverageStatus,reason:string,basis:string,applicability='DOCUMENTARY_ONLY_LOCAL_TEACHING_NOT_ESTABLISHED'){
 const rows=annualGapUnits.filter(r=>r.catalogLevelId===level&&r.subjectName===subject);
 const math=/math/i.test(subject)?[...annualPrimarySections.filter(r=>r.catalogLevelId===level),...secondaryStructuredUnits.filter(r=>r.catalogLevelId===level)]:[];
 const taught=rows.filter(r=>r.objective&&r.competency);
 scopes.push({id:`annual-scope-v1-${level}-${slug(subject)}`,catalogLevelId:level,subjectName:subject,period:'YEAR',officialSource:sources,structuredContent:[...rows.map(r=>r.id),...math.map(r=>r.id)],themes:[...new Set([...rows.flatMap(r=>r.themes),...math.map(r=>'theme' in r?r.theme:r.title)])],units:taught.length+math.length,lessonsActivities:rows.filter(r=>r.activity).length,objectives:taught.length+math.length,competencies:taught.length+math.length,coverageStatus:status,missingReason:reason,applicability,documentaryUsable:sources.length>0&&status!=='PENDING_SOURCE',assessmentGuidance:[...rows.map(r=>r.assessment),...math.map(r=>'assessment' in r?r.assessment:null)].filter((v):v is string=>Boolean(v)),locators:[...rows.map(r=>r.sourceLocator),...math.map(r=>r.sourceLocator)],moduleIndexCount:rows.filter(r=>r.contentKind==='LOCATED_MODULE_INDEX').length,expectedBasis:basis});
}
const fr=[['sil','cp'],['ce1','ce2'],['cm1','cm2']];
for(const source of subjectMappingSources.filter(s=>s.documentId.includes('-primary-'))){
 const language=source.documentId.includes('-fr-')?'fr':'en',n=Number(source.documentId.at(-1));
 const levels=language==='fr'?fr[n-1].map(l=>'fr-primary-'+l):[2*n-1,2*n].map(l=>'en-primary-'+l);
 for(const level of levels)for(const subject of source.names)add(level,subject,[{id:source.documentId,url:source.sourceUrl,version:source.sourceVersion}],'PARTIAL_BLOCKING',/math/i.test(subject)?'Extraits annuels et objectifs documentés ; totalité des cellules et leçons non structurée. Anomalies exclues explicitement.':'Objectifs communs du niveau structurés ; tableaux détaillés propres à la classe et leçons restant à extraire.','MINEDUB_DISCIPLINE_INDEX');
}
for(const plan of earlyYearsAnnualPlans){
 add(plan.catalogLevelId,plan.subjectName,[{id:plan.sourceReference.documentId,url:plan.sourceReference.url,version:plan.sourceReference.checksum}],'ITALO_VALIDATED',plan.missingReason,'ITALO_LOCAL_PROGRAM','LOCAL_VALIDATED_NO_OFFICIAL_LEVEL_EQUIVALENCE');
 const s=scopes.at(-1)!;s.structuredContent=[plan.activityId,plan.id];s.units=7;s.lessonsActivities=7;s.objectives=7;s.competencies=7;s.themes=plan.annualExtensions.map(p=>p.title);s.assessmentGuidance=[plan.annualExtensions[0].assessment];s.locators=[`MINEDUB : référence de domaines uniquement, pages ${plan.sourceReference.sourcePages.join(", ")}`];s.validatedFor=plan.validation;
}
const excluded=new Set(['minesec-31','minesec-64','minesec-15','minesec-16','minesec-147','minesec-148','minesec-76']);
for(const level of secondarySubjectSources)for(const subject of level.subjects){
 const sources=subject.sources.map(s=>({id:s.documentId,url:s.sourceUrl,version:s.sourceVersion}));
 const usable=sources.length>0&&!sources.some(s=>excluded.has(s.id));
 const content=annualGapUnits.some(r=>r.catalogLevelId===level.catalogLevelId&&r.subjectName===subject.officialSubject&&r.objective)||secondaryStructuredUnits.some(r=>r.catalogLevelId===level.catalogLevelId&&r.subject===subject.officialSubject);
 add(level.catalogLevelId,subject.officialSubject,sources,!usable?'PENDING_SOURCE':content?'PARTIAL_BLOCKING':'PARTIAL_BLOCKING',!usable?'Source définitive exploitable absente, contradictoire ou projet : voir le registre des pièces.':content?'Synthèses et objectifs partiels ; les leçons et ressources détaillées restent à structurer.':'Source authentifiée disponible ; index éventuel, mais objectifs et contenu pédagogique insuffisamment structurés.','MINESEC_DOCUMENTED_CANDIDATE_NOT_MANDATORY_SUBJECT');
}
// Explicit gaps already identified in the established assessment; never a declaration
// that a discipline is compulsory or taught locally. Unknown series stay outside inference.
const gaps:Record<string,string[]>={
 'fr-secondary-6e':['Français','Anglais','Éducation physique et sportive','Travail manuel'],
 'fr-secondary-5e':['Français','Anglais','Éducation physique et sportive','Travail manuel'],
 'fr-secondary-4e':['PCT','SVT','Informatique','Éducation physique et sportive'],
 'fr-secondary-3e':['PCT','SVT','Informatique','Éducation physique et sportive'],
 'en-secondary-form1':['Chemistry','English Language','French','Geography','History','Citizenship'],
 'en-secondary-form2':['Chemistry','English Language','French','Geography','History','Citizenship'],
 'en-secondary-form3':['English Language','Literature in English'],
 'en-secondary-form4':['English Language','Literature in English'],
 'en-secondary-form5':['English Language','Literature in English'],
};
for(const [level,subjects] of Object.entries(gaps))for(const subject of subjects)if(!scopes.some(s=>s.catalogLevelId===level&&s.subjectName===subject))add(level,subject,[],'PENDING_SOURCE','Lacune du bilan documentaire : programme exact authentifié non retrouvé. Ni un manuel, ni une progression tierce ne remplace le syllabus.','ESTABLISHED_DOCUMENTARY_GAP_NOT_LOCAL_REQUIREMENT');
for(const verified of annualVerifiedScopes){
 const units=annualVerifiedUnits.filter(u=>u.catalogLevelId===verified.catalogLevelId&&u.subjectName===verified.subjectName);const first=units[0];
 let row=scopes.find(r=>r.catalogLevelId===verified.catalogLevelId&&r.subjectName===verified.subjectName);
 if(!row){add(verified.catalogLevelId,verified.subjectName,[{id:first.documentId,url:first.sourceUrl,version:first.sourceVersion}],'COMPLETE','', 'PUBLISHED_LOCAL_SUBJECT_OFFICIAL_SUBDOMAIN');row=scopes.at(-1)!;}
 Object.assign(row,{coverageStatus:'COMPLETE',documentaryUsable:true,structuredContent:units.map(u=>u.id),themes:[...new Set(units.map(u=>u.theme))],units:units.length,lessonsActivities:units.length,objectives:units.length,competencies:units.length,moduleIndexCount:0,assessmentGuidance:[...new Set(units.map(u=>u.assessment))],locators:units.map(u=>u.sourceLocator),missingReason:'Tableaux de cette discipline ou sous-discipline structurés intégralement pour la colonne de classe, avec objectifs, compétences, activités et critères d’évaluation. Calendrier et séances détaillées à préparer localement ; aucune équivalence avec le domaine sciences entier.'});
}
export const annualCoverageScopes=scopes;
export const unenumeratedAnnualScopes=[{catalogLevelId:'fr-secondary-1re',reason:'Aucune série locale ni liste disciplinaire exploitable : les couples attendus ne peuvent pas être inventés.'},{catalogLevelId:'SECOND_CYCLE',reason:'Les combinaisons réellement ouvertes restent inconnues. Le nombre documentaire est exact, le total des matières obligatoires ITALO ne peut pas être certifié.'}];
export function summarizeAnnualCoverage(rows:AnnualScope[]){
 const counts:Record<AnnualCoverageStatus,number>={COMPLETE:0,ITALO_VALIDATED:0,PARTIAL_BLOCKING:0,PENDING_SOURCE:0,NOT_APPLICABLE:0};
 for(const row of rows)counts[row.coverageStatus]++;
 return {expectedDocumentaryScopes:rows.length,...counts,completeScopePercentage:rows.length?100*counts.COMPLETE/rows.length:0,scopesWithPedagogicalContentPercentage:rows.length?100*(counts.COMPLETE+counts.ITALO_VALIDATED+counts.PARTIAL_BLOCKING)/rows.length:0,documentaryUsable:rows.filter(r=>r.documentaryUsable).length,documentaryCoveragePercentage:rows.length?100*rows.filter(r=>r.documentaryUsable).length/rows.length:0,UNCLASSIFIED:rows.filter(r=>!Object.hasOwn(counts,r.coverageStatus)).length,GENERIC_PARTIAL:0,mandatoryLocalDenominatorEstablished:false};
}
