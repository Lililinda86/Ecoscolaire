import assert from 'node:assert/strict';
export function evaluateBackendRuns(runs, sha) {
  assert.match(sha || '', /^[a-f0-9]{40}$/);
  const exact=runs.filter(r=>r.head_sha===sha && r.head_branch==='main' && r.event==='push' && r.path==='.github/workflows/firebase-deploy.yml').sort((a,b)=>b.id-a.id);
  if(!exact.length || exact[0].status!=='completed') return 'wait';
  if(exact[0].conclusion==='success') return 'ready';
  throw new Error('Production backend gate failed: '+exact[0].conclusion);
}
export async function waitForProductionBackend(environment=process.env) {
  const sha=environment.VERCEL_GIT_COMMIT_SHA;
  assert.match(sha || '', /^[a-f0-9]{40}$/,'Exact Vercel source SHA required');
  const url=`https://api.github.com/repos/Lililinda86/Ecoscolaire/actions/workflows/firebase-deploy.yml/runs?head_sha=${sha}&branch=main&event=push&per_page=20`;
  for(let attempt=0;attempt<40;attempt++) {
    const response=await fetch(url,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});
    if(response.ok) {
      const result=evaluateBackendRuns((await response.json()).workflow_runs||[],sha);
      if(result==='ready'){console.log('Exact-SHA Production backend gate PASS: '+sha);return;}
    } else if(response.status!==403 && response.status!==429 && response.status<500) throw new Error('Backend gate API HTTP '+response.status);
    console.log('Waiting for successful exact-SHA Production backend deployment');
    await new Promise(resolve=>setTimeout(resolve,30000));
  }
  throw new Error('Production backend gate timed out; frontend publication refused');
}
