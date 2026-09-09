import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const sha = process.env.EXPECTED_STAGING_SHA;
assert.match(sha || '', /^[a-f0-9]{40}$/);
assert.equal(process.env.GITHUB_SHA, sha);
assert.equal(process.env.VITE_FIREBASE_PROJECT_ID, 'ecoscolaire-staging');
const api = path => JSON.parse(execFileSync('gh', ['api', path], {encoding:'utf8'}));
let url;
for (let attempt=0; attempt<30 && !url; attempt++) {
  const deployments=api(`repos/${process.env.GITHUB_REPOSITORY}/deployments?sha=${sha}&environment=Preview&per_page=100`);
  for (const deployment of deployments) {
    assert.equal(deployment.sha,sha);
    const success=api(`repos/${process.env.GITHUB_REPOSITORY}/deployments/${deployment.id}/statuses`).find(s=>s.state==='success');
    if (success) {url=success.environment_url;break;}
  }
  if (!url) await new Promise(r=>setTimeout(r,10000));
}
assert.ok(url,'Exact Preview deployment required');
assert.match(url,/^https:\/\/ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/);
const headers={};
if(process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass']=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const response=await fetch(`${url}/build-receipt.json`,{headers});
assert.equal(response.status,200);
const receipt=await response.json();
assert.equal(receipt.sha,sha);assert.equal(receipt.firebaseProjectId,'ecoscolaire-staging');assert.equal(receipt.mode,'staging');
fs.appendFileSync(process.env.GITHUB_ENV,`STAGING_APP_URL=${url}\nTARGET_DEPLOYMENT_VERIFIED=true\n`);
console.log(JSON.stringify({sha,url,receipt}));
