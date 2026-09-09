import { writeFileSync } from 'node:fs';
// Read-only public catalogue crawl. No credentials, uploads or management endpoints.
const roots = [90,48];
const queue = roots.map(id=>({id,path:[]}));
const seen = new Set();
const folders = [];
while(queue.length) {
  const batch = queue.splice(0,2);
  await Promise.all(batch.map(async ({id,path})=>{
    if(seen.has(id)) return;
    seen.add(id);
    if(seen.size>100) throw Error('Folder scope limit');
    const r=await fetch('https://files.minesec.gov.cm/ajax/_load_album.ajax.php',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({nodeId:String(id),pageStart:'1',perPage:'250',filterOrderBy:''}),signal:AbortSignal.timeout(25000)});
    if(!r.ok) throw Error(`Public folder ${id}: ${r.status}`);
    const d=await r.json(); const h=d.html;
    const chunks=h.split(/(?=<div (?:id="folderItem|dttitle=))/).slice(1);
    const items=chunks.map(s=>({title:s.match(/class="filename"[^>]*>([^<]+)/)?.[1]||s.match(/dttitle="([^"]+)"/)?.[1],folder:s.match(/folderId="(\d+)"/)?.[1],url:s.match(/(?:sharing-url|dtfullurl)="([^"]+)"/)?.[1],fileId:s.match(/fileId="(\d+)"/)?.[1]}));
    const pages=Number(h.match(/id="rspTotalPages" value="([^"]+)/)?.[1]||0);
    if(pages>1) throw Error(`Pagination required for ${id}: ${pages}`);
    folders.push({id,path,listedAt:new Date().toISOString(),pageTitle:d.page_title,items});
    for(const i of items)if(i.folder)queue.push({id:Number(i.folder),path:[...path,i.title]});
    console.log(JSON.stringify({folder:id,path,items:items.length,files:items.filter(i=>!i.folder).map(i=>({title:i.title,url:i.url,header:i.header}))}));
  }));
}
const target='docs/pedagogy-content-completion/MINESEC_PUBLIC_INDEX.json';
const result=JSON.stringify({authority:'MINESEC',rootPages:['https://www.minesec.gov.cm/web/index.php/fr/systeme-educatif/progammes-officiels','https://www.minesec.gov.cm/web/index.php/en/systeme-educatif-en/progammes-d-etudes-en'],scope:'Public General Education folders linked from ministry; metadata only, not file authentication or current applicability',folders},null,2);
writeFileSync(target,result+'\n'); // Generated metadata, no full source text.
console.log('PUBLIC_INDEX_FOLDERS='+folders.length);
