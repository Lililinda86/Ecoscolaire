import fs from 'node:fs';import {resolve} from 'node:path';import {createRequire} from 'node:module';
const read=createRequire(import.meta.url)('./lib/read-project-ts.cjs');
const {annualCoverageScopes,annualGapUnits,summarizeAnnualCoverage,unenumeratedAnnualScopes}=read(resolve('src/features/pedagogy/resources/annualCoverage.ts'));
const groups={};for(const prefix of ['fr-preschool','en-nursery','fr-primary','en-primary','fr-secondary','en-secondary'])groups[prefix]=summarizeAnnualCoverage(annualCoverageScopes.filter(s=>s.catalogLevelId.startsWith(prefix)));
const out={schemaVersion:1,scope:'DOCUMENTARY_CANDIDATES_NOT_CONFIRMED_ITALO_SUBJECTS',summary:summarizeAnnualCoverage(annualCoverageScopes),groups,unenumeratedAnnualScopes,newContent:{entries:annualGapUnits.length,summaries:annualGapUnits.filter(u=>u.objective&&u.competency).length,indexOnly:annualGapUnits.filter(u=>!u.objective||!u.competency).length},scopes:annualCoverageScopes};
const dir='docs/pedagogy-final-gaps';const json=JSON.stringify(out,null,2)+'\n';
const columns=['id','catalogLevelId','subjectName','period','coverageStatus','units','moduleIndexCount','lessonsActivities','objectives','competencies','officialSource','structuredContent','themes','missingReason','applicability','expectedBasis'];
const csv=[columns.join(','),...annualCoverageScopes.map(s=>columns.map(k=>'"'+(typeof s[k]==='object'?JSON.stringify(s[k]):String(s[k])).replaceAll('"','""')+'"').join(','))].join('\n')+'\n';
for(const [file,data] of [['ANNUAL_MATRIX.json',json],['ANNUAL_MATRIX.csv',csv]]){const p=dir+'/'+file;if(process.argv.includes('--check')){if(fs.readFileSync(p,'utf8')!==data)throw Error('Stale annual export: '+p);}else fs.writeFileSync(p,data);}
console.log(JSON.stringify({summary:out.summary,groups,newContent:out.newContent},null,2));

