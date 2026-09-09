import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
const base='e1f236ae5c370e9de5ccf9efaa99d53483b9b1a4';
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
const original=p=>execFileSync('git',['show',`${base}:${p}`],{encoding:'utf8'}).replaceAll('\r\n','\n');
const index=read('functions/src/index.ts');
const exported=index+[...index.matchAll(/export \* from '([^']+)'/g)].map(m=>read('functions/src/'+m[1]+'.ts')).join('\n');
const manifest=JSON.parse(read('scripts/limited-parameters-functions.json'));
test('limited release retains every Production workflow and guard',()=>{
 const files=execFileSync('git',['ls-tree','-r','--name-only',base,'.github/workflows','tests/security','scripts'],{encoding:'utf8'}).trim().split('\n');
 for(const file of files.filter(f=>f.startsWith('.github/workflows/') || /production|secret-guard|backup-gate|main-payment-lots/.test(f))){
  assert.ok(fs.existsSync(file),`${file} retained`);
  if(file==='.github/workflows/firebase-deploy.yml') assert.equal(read(file).replaceAll('functions:manageAcademicPeriod,functions:updateAcademicYearBounds,','functions:manageAcademicPeriod,'),original(file));
  else if(file==='tests/security/production-deploy-workflow.spec.mjs') assert.equal(read(file).replace("  'manageAcademicPeriod',\n  'updateAcademicYearBounds',","  'manageAcademicPeriod',"),original(file));
  else assert.equal(read(file),original(file),`${file} not weakened`);
 }
});
test('no new pedagogy or unrelated product change',()=>{
 const files=execFileSync('git',['diff','--name-only',base,'--','src','functions/src','storage.rules','firestore.indexes.json'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
 const allowed=new Set(['functions/src/classCycle.ts','functions/src/feeTargeting.ts','functions/src/schoolFeeCatalog.ts','functions/src/studentAccountCollections.ts','functions/src/studentTransportPlan.ts','src/components/Settings/FinancialSettingsReadOnly.tsx','src/components/Settings/SchoolFeeCatalog.css','src/components/Settings/SchoolFeeCatalog.tsx','src/components/StudentAccountCollection.css','src/pages/Settings.css','src/pages/Settings.tsx','src/pages/Students.tsx']);
 for(const file of files) assert.ok(allowed.has(file),`out of scope: ${file}`);
 assert.equal(read('functions/src/index.ts'),original('functions/src/index.ts'));
 assert.equal(read('src/App.tsx'),original('src/App.tsx'));
 assert.equal(read('storage.rules'),original('storage.rules'));
});
test('scoped manifest covers Settings and collection callables with no pedagogy export',()=>{
 assert.equal(new Set(manifest).size,manifest.length);
 for(const name of ['getSchoolFeeCatalog','manageSchoolFee','setStudentTransportPlan','getStudentFinancialAccount','recordCashCollection','reverseCashCollection','manageAcademicPeriod','updateAcademicYearBounds','createPaymentMoratorium','submitPaymentMoratorium','approvePaymentMoratorium','rejectPaymentMoratorium','createFinancialBenefit','submitFinancialBenefit','approveFinancialBenefit','rejectFinancialBenefit','cancelFinancialBenefit']) assert.ok(manifest.includes(name),name);
 for(const name of manifest) {
  assert.ok(!/pedagog|curriculum|Grades|ReportCard|Teacher|Program|Evaluation|Staff/.test(name),name);
  assert.match(exported,new RegExp('\\b'+name+'\\b'),`${name} exported`);
  assert.ok(read('.github/workflows/firebase-deploy.yml').includes('functions:'+name),`${name} present in Production manifest`);
 }
 const workflow=read('.github/workflows/limited-parameters-staging.yml');
 assert.ok(workflow.includes('test "$GOOGLE_CLOUD_PROJECT" = ecoscolaire-staging'));
 assert.ok(workflow.includes('--project ecoscolaire-staging --non-interactive'));
 assert.ok(!workflow.includes('--project ecoscolaire-c5861'));
});
