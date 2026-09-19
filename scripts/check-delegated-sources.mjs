import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
const r=createRequire(import.meta.url)('./lib/read-project-ts.cjs');
const {minedubDocuments}=r(resolve('src/features/pedagogy/resources/minedubVerified.ts'));
const meta=JSON.parse(readFileSync('docs/pedagogy-content-completion/MINESEC_VERIFIED_FILE_METADATA.json'));
const dir='output/delegated-validation/sources';mkdirSync(dir,{recursive:true});
const checks=[];const hash=b=>createHash('sha256').update(b).digest('hex');
for(const d of meta.files){const bytes=readFileSync(join(process.argv[2],d.fileId+'.pdf'));if(hash(bytes)!==d.sha256)throw Error('Cached source mismatch '+d.fileId);checks.push({id:'minesec-'+d.fileId,hash:d.sha256,status:'ARCHIVED_AUTHENTICATED_VERSION_RECHECKED',retrievedAt:d.retrievedAt,checkedAt:new Date().toISOString(),currentEditionCertified:false});}
for(let i=0;i<minedubDocuments.length;i+=2) await Promise.all(minedubDocuments.slice(i,i+2).filter(d=>!d.id.endsWith('-variant')).map(async d=>{
 const url='https://www.minedub.cm/download/350/archives/'+d.download;
 try{const res=await fetch(url,{signal:AbortSignal.timeout(45000)}),b=Buffer.from(await res.arrayBuffer());if(!res.ok||b.subarray(0,5).toString()!=='%PDF-')throw Error('No PDF');const sha=hash(b);if(sha!==d.sha)throw Error('Source version changed');writeFileSync(join(dir,d.id+'.pdf'),b);checks.push({id:d.id,url,hash:sha,status:'LIVE_HASH_MATCH',checkedAt:new Date().toISOString(),currentEditionCertified:false});console.log(d.id+' LIVE_HASH_MATCH');}catch(e){checks.push({id:d.id,url,status:'CHECK_FAILED',reason:e.message,checkedAt:new Date().toISOString()});console.log(d.id+' CHECK_FAILED');}
}));
writeFileSync('output/delegated-validation/source-checks.json',JSON.stringify(checks,null,2)+'\n');
console.log(JSON.stringify({sources:checks.length,liveMatches:checks.filter(c=>c.status==='LIVE_HASH_MATCH').length,archivedMatches:checks.filter(c=>c.status.startsWith('ARCHIVED')).length,failed:checks.filter(c=>c.status==='CHECK_FAILED').length}));
