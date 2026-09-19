import {readFileSync,appendFileSync} from 'node:fs';
import {initializeApp,applicationDefault,deleteApp} from 'firebase-admin/app';
import {initializeFirestore} from 'firebase-admin/firestore';
import assert from 'node:assert/strict';
import {runValidationGroup,digest} from './lib/delegated-validation-batch.mjs';
const policy=Object.freeze({projectId:'ecoscolaire-staging',manifestDigest:'af171a5f520642e250f397161f637bd9e6b9590d814c31bb70cab0384d2eadea',authorizationReference:'sha256:1985fc32501c943edd766005794b03a5c039e8748a4312f722497bc8baefc08f'});
const [file,mode,...extra]=process.argv.slice(2);
assert(file&&!extra.length&&['--dry-run','--apply-reviewed'].includes(mode));
assert(!process.env.FIRESTORE_EMULATOR_HOST&&!process.env.FIREBASE_AUTH_EMULATOR_HOST);
for(const key of ['GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT','FIREBASE_PROJECT_ID'])assert(!process.env[key]||process.env[key]===policy.projectId,'Project conflict');
const manifest=JSON.parse(readFileSync(file,'utf8'));assert.equal(digest(manifest),policy.manifestDigest);
const app=initializeApp({projectId:policy.projectId,credential:applicationDefault()}),db=initializeFirestore(app,{preferRest:true});
const results=[];
const emit=row=>{console.log(JSON.stringify(row));appendFileSync('output/delegated-validation/batch-results.jsonl',JSON.stringify({...row,checkedAt:new Date().toISOString()})+'\n');};
try{
 for(const group of manifest.groups){
  try{
   const dry=await runValidationGroup(db,policy,manifest,group,'dry-run');emit({phase:'DRY_RUN',...dry});
   if(mode==='--apply-reviewed'){
    const applied=await runValidationGroup(db,policy,manifest,group,'apply',dry.snapshot);emit({phase:'APPLY',...applied});
    const reload=await runValidationGroup(db,policy,manifest,group,'dry-run');assert(reload.idempotent&&reload.persisted===group.writes.length);emit({phase:'RELOAD_AUDIT_IDEMPOTENCE',...reload});
   }
   results.push({group:group.id,status:'PASS'});
  }catch(e){emit({phase:'CONFLICT_ISOLATED',group:group.id,error:e.message});results.push({group:group.id,status:'BLOCKED'});}
 }
 emit({phase:'SUMMARY',mode,passed:results.filter(r=>r.status==='PASS').length,blocked:results.filter(r=>r.status==='BLOCKED').length,openaiCalls:0,productionTouched:false});
 if(results.some(r=>r.status==='BLOCKED'))process.exitCode=1;
}finally{await deleteApp(app);}
