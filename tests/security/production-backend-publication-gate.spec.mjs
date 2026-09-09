import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateBackendRuns } from '../../scripts/wait-production-backend.mjs';
const sha='a'.repeat(40);
const run={id:1,head_sha:sha,head_branch:'main',event:'push',path:'.github/workflows/firebase-deploy.yml',status:'completed',conclusion:'success'};
test('only a successful exact Production backend permits publication',()=>{assert.equal(evaluateBackendRuns([run],sha),'ready');for(const patch of [{head_sha:'b'.repeat(40)},{head_branch:'staging'},{event:'pull_request'},{path:'other.yml'},{status:'in_progress'}])assert.equal(evaluateBackendRuns([{...run,...patch}],sha),'wait');});
test('failed or skipped backend blocks frontend publication',()=>{for(const conclusion of ['failure','cancelled','skipped'])assert.throws(()=>evaluateBackendRuns([{...run,conclusion}],sha),/failed/);assert.equal(evaluateBackendRuns([],sha),'wait');assert.throws(()=>evaluateBackendRuns([run],''));});
test('latest retry controls the gate',()=>{assert.equal(evaluateBackendRuns([run,{...run,id:2,status:'in_progress'}],sha),'wait');});
