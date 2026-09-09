import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const index=JSON.parse(readFileSync('docs/pedagogy-content-completion/MINESEC_PUBLIC_INDEX.json','utf8'));
const privateDir=resolve('../pedagogy-ministry-research-private');
mkdirSync(privateDir,{recursive:true});
const py='C:/Users/Linda LEMOFOUET/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const items=index.folders.flatMap(f=>f.items.filter(i=>i.fileId).map(i=>({...i,path:f.path})));
const out=[];
for(let n=0;n<items.length;n+=2){await Promise.all(items.slice(n,n+2).map(async i=>{
  const cache=resolve(privateDir,i.fileId+'.json');
  try{
    if(existsSync(cache)){const old=JSON.parse(readFileSync(cache,'utf8'));out.push(old.metadata);return;}
    const d=await (await fetch('https://files.minesec.gov.cm/ajax/_account_file_details.ajax.php',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({u:i.fileId}),signal:AbortSignal.timeout(25000)})).json();
    const u=d.html.match(/gview\?url=(.*?)&embedded=true/)?.[1]?.replace(/&amp;/g,'&');
    if(!u||new URL(u).hostname!=='files.minesec.gov.cm')throw Error('Public PDF reader unavailable');
    const r=await fetch(u,{signal:AbortSignal.timeout(45000)});
    const b=Buffer.from(await r.arrayBuffer());
    if(!r.ok||b.subarray(0,5).toString()!=='%PDF-')throw Error('PDF content unavailable');
    if(b.length>15000000)throw Error('File size limit');
    const pages=JSON.parse(execFileSync(py,['-c','import sys,json; import pypdfium2 as pdf; r=pdf.PdfDocument(sys.stdin.buffer.read()); print(json.dumps([p.get_textpage().get_text_range() for p in r],ensure_ascii=True))'],{input:b,encoding:'utf8',maxBuffer:15000000,timeout:60000,stdio:['pipe','pipe','pipe']}));
    const metadata={...i,url:i.url.replace(/&amp;/g,'&'),sha256:createHash('sha256').update(b).digest('hex'),pages:pages.length,bytes:b.length,retrievedAt:new Date().toISOString(),status:'MINISTRY_HOSTED_PDF_RETRIEVED',currentApplicability:'NOT_ESTABLISHED',rights:'LINK_METADATA_ONLY'};
    writeFileSync(resolve(privateDir,i.fileId+'.pdf'),b);
    writeFileSync(cache,JSON.stringify({metadata,pageText:pages},null,2));
    out.push(metadata);console.log(JSON.stringify({id:i.fileId,title:i.title,pages:pages.length,status:metadata.status}));
  }catch(e){out.push({...i,status:'RETRIEVAL_FAILED',reason:e.message.includes('timed')?'timeout':'PDF retrieval/extraction failed'});console.log(JSON.stringify({id:i.fileId,status:'RETRIEVAL_FAILED'}));}
}));}
writeFileSync('docs/pedagogy-content-completion/MINESEC_VERIFIED_FILE_METADATA.json',JSON.stringify({scope:'Metadata only. Ministry provenance and bytes verified; curriculum content, edition and applicable levels require individual review.',files:out},null,2)+'\n');
console.log('FILES_RETRIEVED='+out.filter(x=>x.sha256).length+'/'+out.length);
