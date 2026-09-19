import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { digest, actor } from './lib/delegated-validation-batch.mjs';
const require=createRequire(import.meta.url), readTs=require('./lib/read-project-ts.cjs');
const data=name=>readTs(resolve('src/features/pedagogy/resources/'+name+'.ts'));
const {earlyYearsLevels,earlyYearsActivities}=data('earlyYearsProgram');
const {secondaryStructuredUnits}=data('secondaryStructuredUnits');
const {materialCatalog}=data('materialCatalog');
const {annualPrimarySections,annualPrimarySourceCautions}=data('annualPrimarySections');
const sourceChecks=JSON.parse(readFileSync('output/delegated-validation/source-checks.json','utf8'));
assert.equal(sourceChecks.filter(s=>s.status==='LIVE_HASH_MATCH').length,8,'Eight current MINEDUB hashes required');
assert.equal(sourceChecks.filter(s=>s.status==='ARCHIVED_AUTHENTICATED_VERSION_RECHECKED').length,81,'MINESEC archive hashes required');
const {matchOfficialSubjects,primaryDocumentByLevel,documentaryRelationsFor}=readTs(resolve('src/features/pedagogy/services/subjectMapping.ts'));
const {subjectMappingSources}=readTs(resolve('functions/src/pedagogy/subjectMappingSources.ts'));
const {secondarySubjectSources}=readTs(resolve('functions/src/pedagogy/secondarySubjectSources.ts'));
const state=JSON.parse(readFileSync('output/delegated-validation/current-state.json','utf8'));
const {schoolId,academicYearId}=state;
assert.equal(state.projectId,'ecoscolaire-staging'); assert.equal(schoolId,'school-italo-official');
const authorizationReference='sha256:'+createHash('sha256').update(readFileSync(process.argv[2])).digest('hex');
const active=d=>d.isActive!==false&&d.active!==false&&!['inactive','archived'].includes(d.status)&&(!d.academicYearId||d.academicYearId===academicYearId);
const classes=state.classes.filter(active),catalog=state.subjects.filter(active),groups=[],decisions=[];
const guardHashes=Object.fromEntries(['classes','subjects','classPrograms','classSubjects','curriculumProposalReviews','curriculumSubjectMappings'].map(c=>[c,digest([...state[c]].sort((a,b)=>a.id.localeCompare(b.id)))]));
const common=(g,classification,decision,reason,evidence,sourceVersion,mappingVersion)=>({schoolId,academicYearId,classification,decision,reason,evidence,sourceVersion,mappingVersion,decisionOrigin:'OWNER_DELEGATED_VALIDATION',decisionAuthorizedBy:'owner',decisionAuthorizedByRole:'owner',decisionRecordedBy:actor,decidedBy:actor,authorizationReference,decisionBatchId:g.id,revision:1,adoptionChanged:false,classProgramPublished:false});
const group=(suffix,kind)=>{const g={id:'delegated-20260919-'+suffix,kind,writes:[]};groups.push(g);return g;};
const add=(g,path,d)=>{g.writes.push({path,data:d});decisions.push({group:g.id,path,classification:d.classification,decision:d.validationDecision||d.decision,level:d.catalogLevelId||null,subject:d.officialSubject||d.subjectName||null,reason:d.reason});};
for(const cls of classes.filter(c=>primaryDocumentByLevel[c.catalogLevelId])) {
 const source=subjectMappingSources.find(s=>s.documentId===primaryDocumentByLevel[cls.catalogLevelId]);
 const mappings=matchOfficialSubjects(source.names,catalog,schoolId,source.section).map(m=>({...m,documentaryRelations:documentaryRelationsFor(cls.catalogLevelId,m)}));
 const mappingVersion=digest(['local-organization-v1',cls.id,source.sourceVersion,mappings]);
 const pending=mappings.filter(m=>m.documentaryRelations.some(r=>r.type==='UNRESOLVED')); if(!pending.length)continue;
 const g=group(cls.catalogLevelId,'PRIMARY_LOCAL_ORGANIZATION');
 for(const m of pending) {
  const evidence={sourceDocumentId:source.documentId,sourceUrl:source.sourceUrl,relations:m.documentaryRelations,localSubjects:m.candidates.map(c=>({id:c.id,name:c.name})),sourcePages:source.pdfPages};
  add(g,'curriculumSubjectMappings/'+digest(['local-organization-v1',schoolId,academicYearId,cls.id,m.officialSubject]),{...common(g,'C','KEEP_LOCAL_SUBJECTS_DISTINCT','Conserver les matières locales existantes et leurs intitulés. Aucune fusion ni équivalence au domaine complet. Le contenu effectivement couvert reste à documenter ; choix réversible, aucune matière déclarée ouverte ni enseignée.',evidence,source.sourceVersion,mappingVersion),scope:'ITALO_PEDAGOGICAL_CHOICE',classId:cls.id,catalogLevelId:cls.catalogLevelId,officialSubject:m.officialSubject,subjectIds:m.candidates.map(c=>c.id),sourceDocumentId:source.documentId,unresolvedCoverage:'PENDING_SOURCE',reversible:true});
 }
}
for(const level of earlyYearsLevels) {
 const cls=classes.find(c=>c.catalogLevelId===level.id); if(!cls)continue;
 const activities=earlyYearsActivities(level.id),programId='italo-early-years-v1-'+level.id;
 const sourceVersion=digest(activities),mappingVersion=digest(['early-years-local-v1',cls.id,sourceVersion]),g=group(level.id,'PRESCHOOL_LOCAL_PROGRAM');
 const reason='Validation locale ITALO des cinq domaines et activités graduées par jeu, observation et soutien. Adaptation individuelle par l’enseignant, sans durée ni note imposée. Aucun statut ni rattachement de niveau MINEDUB attribué ; corpus initial partiel.';
 const evidence={localContentVersion:'1.0',activityIds:activities.map(a=>a.id),domainReferences:activities.map(a=>a.domainReference),safetyReviewed:true,officialLevelEquivalent:null};
 const trace=common(g,'C','ITALO_LOCAL_PROGRAM_VALIDATED',reason,evidence,sourceVersion,mappingVersion);
 add(g,'curriculumPrograms/'+programId,{...trace,id:programId,title:'ITALO — '+level.label+' — programme local partiel',countryCode:'CM',section:level.language==='fr'?'francophone':'anglophone',cycle:'nursery',catalogLevelId:level.id,version:'1.0',checksum:sourceVersion,status:'published',sourceType:'local',authority:'ITALO',programKind:'ITALO_EARLY_YEARS_PROGRAM',coverage:'PARTIAL',applicability:'LOCAL_VALIDATED',subjectNames:activities.map(a=>a.domain),provenance:{label:'Activités originales ITALO validées par délégation',note:reason}});
 for(const [i,a] of activities.entries()) {
  const id=a.id+'-validated-v1',subject=catalog.find(s=>s.name===a.domain&&(s.section===(level.language==='fr'?'francophone':'anglophone')||s.section==='all')); assert(subject,'Missing preschool domain');
  add(g,'curriculumUnits/'+id,{...trace,id,programId,catalogLevelId:level.id,subjectId:subject.id,subjectName:a.domain,domain:a.domain,theme:a.title,title:a.title,objective:a.objective,competency:a.observable,activity:a.activity,methodology:a.activity,assessment:'Observation qualitative : '+a.observable,prerequisites:null,materials:a.materials,remediation:a.support,safety:a.safety,sequence:i+1,period:null,officialLesson:null,status:'published',sourceType:'local',sourceDocumentId:programId,sourceUrl:a.domainReference.url,sourceLocator:'Activité originale ITALO '+a.id+' ; domaines seuls : MINEDUB PDF 5–6',verificationStatus:'ITALO_LOCAL_VALIDATED',coverage:'PARTIAL',officialLevelEquivalent:null,contentKind:'LOCAL_ACTIVITY'});
 }
 const id=[schoolId,academicYearId,level.id].join('__');
 add(g,'schoolCurriculumAdoptions/'+id,{...trace,id,catalogLevelId:level.id,classId:cls.id,curriculumProgramId:programId,programVersion:'1.0',programChecksum:sourceVersion,status:'active',programKind:'ITALO_EARLY_YEARS_PROGRAM',sourceAuthentication:'LOCAL_ONLY_NOT_OFFICIAL_EQUIVALENCE',adoptionChanged:true,decision:{declarationReceived:true,declaredBy:'owner — autorisation déléguée, enregistrement par workflow',effectiveDate:'2026-09-19',reference:authorizationReference,recordedBy:actor,decisionOrigin:'OWNER_DELEGATED_VALIDATION'},validationDecision:'ITALO_LOCAL_PROGRAM_VALIDATED',createdBy:actor,updatedBy:actor,adoptedBy:actor});
}
const blockedIds=new Set(['31','64']),draftIds=new Set(['15','16','147','148','76']),optionalIds=new Set(['46','47','48','49','51','144','146','79','80','195','196']);
for(const cls of classes.filter(c=>c.cycle==='secondary'||c.catalogLevelId?.includes('-secondary-'))) {
 const source=secondarySubjectSources.find(s=>s.catalogLevelId===cls.catalogLevelId),g=group(cls.catalogLevelId,'SECONDARY_SOURCE_REVIEW');
 const subjects=source?.subjects.length?source.subjects:[{officialSubject:'Corpus du niveau',sources:[]}];
 for(const m of subjects) {
  const ids=m.sources.map(s=>s.documentId.replace('minesec-','')),conflict=ids.some(id=>blockedIds.has(id)),draft=ids.some(id=>draftIds.has(id));
  const localUnknown=/2nde|1re|terminale|sixth/.test(cls.catalogLevelId)||ids.some(id=>optionalIds.has(id));
  const classification=conflict?'E':!ids.length||draft?'D':localUnknown?'C':'B';
  const decision=conflict?'BLOCKED_DOCUMENTARY_CONTRADICTION':!ids.length||draft?'PENDING_SOURCE':localUnknown?'PENDING_OWNER_DECISION':'DOCUMENTARY_SOURCE_VALIDATED_WITH_RESERVE';
  const reason=conflict?'Contradiction de couverture : pas de validation déléguée définitive.':draft?'Texte de travail/projet ou promulgation non établie : source définitive requise.':!ids.length?'Aucune source disciplinaire complète authentifiée disponible pour ce niveau.':localUnknown?'Association documentaire conservée ; série, option ou combinaison réellement enseignée inconnue. Aucune sélection locale.':'Provenance ministérielle, discipline et niveau établis par les pièces localisées. Validation documentaire uniquement ; actualité réglementaire et ouverture locale non certifiées, contenu structuré partiel.';
  add(g,'curriculumSubjectMappings/'+digest(['secondary-documentary-v1',schoolId,academicYearId,cls.id,m.officialSubject]),{...common(g,classification,decision,reason,{sources:m.sources,sourceCoverage:ids.length?'SOURCE_DOCUMENT_AVAILABLE':'ABSENT'},digest(m.sources),digest(['secondary-documentary-v1',cls.id,m])),scope:'DELEGATED_SECONDARY_SOURCE_REVIEW',classId:cls.id,catalogLevelId:cls.catalogLevelId,officialSubject:m.officialSubject,coverage:ids.length?'PARTIAL_OFFICIAL_COVERAGE':'PENDING_SOURCE',sourceValidated:!conflict&&!draft&&ids.length>0,localApplicability:localUnknown?'PENDING_OWNER_DECISION':'NOT_ESTABLISHED',workingDraft:draft});
 }
}
for(const cls of classes.filter(c=>secondaryStructuredUnits.some(u=>u.catalogLevelId===c.catalogLevelId))) {
 const rows=secondaryStructuredUnits.filter(u=>u.catalogLevelId===cls.catalogLevelId),g=group('modules-'+cls.catalogLevelId,'SECONDARY_STRUCTURED_CONTENT');
 const programId='minesec-math-documentary-v1-'+cls.catalogLevelId,sourceVersion=rows[0].sourceVersion,mappingVersion=digest(rows);
 const trace=common(g,'B','VALIDATED_WITH_RESERVE','Modules annuels documentés, niveau et pages vérifiés ; index partiel, sans progression hebdomadaire ministérielle ni adoption ITALO.',{documentId:rows[0].sourceDocumentId,url:rows[0].sourceUrl,pages:rows.map(u=>u.sourcePage)},sourceVersion,mappingVersion);
 add(g,'curriculumPrograms/'+programId,{...trace,id:programId,title:'MINESEC — '+rows[0].subject+' — '+rows[0].level+' — modules documentaires',countryCode:'CM',section:rows[0].language==='fr'?'francophone':'anglophone',cycle:'secondary',catalogLevelId:cls.catalogLevelId,version:'documentary-v1',status:'published',sourceType:'official',authority:'MINESEC',coverage:'PARTIAL',applicability:'DOCUMENTARY_VALIDATION_ONLY',subjectNames:[rows[0].subject],sourceChecksum:sourceVersion,provenance:{label:'Modules et reformulations localisées',sourceUrl:rows[0].sourceUrl,note:trace.reason}});
 for(const [i,u] of rows.entries())add(g,'curriculumUnits/'+u.id,{...trace,id:u.id,programId,catalogLevelId:u.catalogLevelId,subjectId:'mathematics',subjectName:u.subject,title:u.title,domain:u.subject,theme:u.title,objective:u.objective,competency:u.competency,sequence:i+1,status:'published',sourceType:'official',sourceDocumentId:u.sourceDocumentId,sourceUrl:u.sourceUrl,sourcePage:u.sourcePage,sourceLocator:'PDF '+u.sourcePage+' ; '+u.sourceLocator+' ; compétence PDF '+u.competencySourcePage,verificationStatus:'DOCUMENTARY_MODULE_VALIDATED_WITH_RESERVE',coverage:'PARTIAL',contentKind:'MODULE_OVERVIEW',activity:null,assessment:null,prerequisites:null,methodology:null,period:null,officialLesson:null,documentaryHours:u.documentaryHours});
}
for(const cls of classes.filter(c=>primaryDocumentByLevel[c.catalogLevelId])) {
 const rows=annualPrimarySections.filter(u=>u.catalogLevelId===cls.catalogLevelId),g=group('annual-'+cls.catalogLevelId,'PRIMARY_ANNUAL_CONTENT');
 assert(rows.length>=5);
 for(const u of rows) {
  const programId=u.documentId+'-review-2018-v1';
  const trace=common(g,'B','VALIDATED_WITH_RESERVE','Synthèse annuelle partielle vérifiée dans la colonne exacte ; cellules contradictoires exclues. Aucune progression hebdomadaire, obligation locale ou leçon détaillée inventée.',{sourceDocumentId:u.documentId,pages:[u.sourcePage,u.methodologyPage,u.assessmentPage].filter(Boolean),sourceUrl:u.sourceUrl,cautions:annualPrimarySourceCautions.filter(c=>c.documentId===u.documentId)},u.sourceVersion,digest(u));
  add(g,'curriculumUnits/'+u.id,{...trace,...u,programId,subjectId:'mathematics',subjectName:u.language==='fr'?'Mathématiques':'Mathematics',title:u.theme+' — '+u.domain,status:'published',sourceType:'official',sourceDocumentId:u.documentId,verificationStatus:'ANNUAL_SECTION_VALIDATED_WITH_RESERVE',activity:null,sourceChecksum:u.sourceVersion,sequence:100+u.sequence});
 }
}
const cautions=group('source-cautions','DOCUMENTARY_EXCLUSIONS');
for(const c of annualPrimarySourceCautions)add(cautions,'curriculumSubjectMappings/'+digest(['source-caution-v1',schoolId,academicYearId,c.documentId]),{...common(cautions,c.status==='PENDING_SOURCE'?'D':'E',c.status,c.reason,{sourceDocumentId:c.documentId,pages:c.pages},sourceChecks.find(x=>x.id===c.documentId).hash,digest(c)),scope:'DELEGATED_SOURCE_CAUTION',officialSubject:'Mathématiques / Mathematics',sourceDocumentId:c.documentId});
const rights=group('ceduc-rights','RESOURCE_RIGHTS');
add(rights,'curriculumSubjectMappings/'+digest(['ceduc-rights-v1',schoolId,academicYearId]),{...common(rights,'D','PENDING_RIGHTS','Identité et droits CEDUC non établis ; aucune copie, aucun statut officiel et aucun blocage du reste du projet.',{resource:'CEDUC',identityEstablished:false,redistributionAuthorized:false},'UNESTABLISHED',digest(['CEDUC','PENDING_RIGHTS'])),scope:'DELEGATED_RESOURCE_CLASSIFICATION',resourceId:'ceduc-unverified',authority:'UNESTABLISHED',rights:'PENDING_RIGHTS',classificationLabel:'PENDING_RIGHTS',officialExam:false,officialAnswerKey:false});
for(let i=0;i<materialCatalog.length;i+=70) {
 const g=group('resources-'+(i/70+1),'RESOURCE_CLASSIFICATION');
 for(const m of materialCatalog.slice(i,i+70))add(g,'curriculumSubjectMappings/'+digest(['resource-classification-v1',schoolId,academicYearId,m.id]),{...common(g,m.authority==='ITALO'?'C':'B','RESOURCE_CLASSIFIED','Notice dédupliquée ; provenance et droits conservés. Un spécimen reste entraînement ; un rapport d’examinateurs n’est pas un corrigé.',{resourceId:m.id,url:m.url,locator:m.locator,rights:m.rights,type:m.type},m.sourceVersion,digest(m)),scope:'DELEGATED_RESOURCE_CLASSIFICATION',resourceId:m.id,authority:m.authority,rights:m.rights,classificationLabel:m.id==='gce-physics-0580-specimen'?'PRACTICE_RESOURCE':m.type,officialExam:false,officialAnswerKey:false});
}
const manifest={schemaVersion:'delegated-validation-v1',projectId:'ecoscolaire-staging',schoolId,academicYearId,authorizationReference,sourceVerificationDigest:digest(sourceChecks),sourceDocuments:Object.fromEntries(state.curriculumPrograms.filter(p=>p.id.startsWith('minedub-')).map(p=>['curriculumPrograms/'+p.id,digest(p)])),guardHashes,groups};
mkdirSync('output/delegated-validation',{recursive:true});
writeFileSync('output/delegated-validation/manifest.json',JSON.stringify(manifest,null,2)+'\n');
writeFileSync('output/delegated-validation/decision-register.json',JSON.stringify(decisions,null,2)+'\n');
console.log(JSON.stringify({manifestDigest:digest(manifest),authorizationReference,groups:groups.length,writes:groups.reduce((n,g)=>n+g.writes.length,0),byKind:Object.fromEntries([...new Set(groups.map(g=>g.kind))].map(k=>[k,groups.filter(g=>g.kind===k).reduce((n,g)=>n+g.writes.length,0)]))}));
