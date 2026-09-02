import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const asRuns = (payload) => Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];

const safeRunSummary = (run) => ({
  conclusion: run?.conclusion || '<none>',
  event: run?.event || '<none>',
  headBranch: run?.head_branch || '<none>',
  headSha: run?.head_sha || '<none>',
  path: run?.path || '<none>',
  status: run?.status || '<none>',
  workflowId: run?.workflow_id || '<none>',
});

export const validateExactDeploymentRun = (payload, {
  allowedEvents = ['push'],
  expectedBranch,
  expectedSha,
  expectedWorkflowId,
  expectedWorkflowPath,
} = {}) => {
  assert.match(expectedSha || '', /^[0-9a-f]{40}$/, 'A full exact deployment SHA is required.');
  assert.ok(expectedBranch, 'The expected deployment branch is required.');
  assert.ok(expectedWorkflowPath, 'The expected deployment workflow path is required.');
  assert.ok(Array.isArray(allowedEvents) && allowedEvents.length > 0, 'At least one deployment event is required.');
  assert.ok(allowedEvents.every((event) => event === 'push' || event === 'workflow_dispatch'),
    'Only approved deployment events are allowed.');
  if (expectedWorkflowId !== undefined) {
    assert.ok(Number.isSafeInteger(expectedWorkflowId) && expectedWorkflowId > 0,
      'The expected deployment workflow ID must be a positive integer.');
  }

  const candidates = asRuns(payload);
  const exactSuccessfulRun = candidates.find((run) => run?.head_sha === expectedSha
    && run?.head_branch === expectedBranch
    && run?.path === expectedWorkflowPath
    && (expectedWorkflowId === undefined || run?.workflow_id === expectedWorkflowId)
    && allowedEvents.includes(run?.event)
    && run?.status === 'completed'
    && run?.conclusion === 'success');

  assert.ok(exactSuccessfulRun, `No approved successful completed ${expectedWorkflowPath} run exists for ${expectedBranch} at exact SHA ${expectedSha}. Observed: ${JSON.stringify(candidates.map(safeRunSummary))}`);
  return exactSuccessfulRun;
};

const main = async () => {
  const [, , runsPath, expectedSha, expectedWorkflowPath, expectedBranch, expectedWorkflowIdRaw, allowedEventsRaw] = process.argv;
  assert.ok(runsPath, 'A workflow-runs JSON path is required.');
  const payload = JSON.parse(await readFile(runsPath, 'utf8'));
  const expectedWorkflowId = expectedWorkflowIdRaw ? Number(expectedWorkflowIdRaw) : undefined;
  const allowedEvents = allowedEventsRaw ? allowedEventsRaw.split(',') : ['push'];
  const run = validateExactDeploymentRun(payload, {
    allowedEvents, expectedBranch, expectedSha, expectedWorkflowId, expectedWorkflowPath,
  });
  console.log(`Verified exact-SHA deployment run ${run.id}.`);
};

if (process.argv[1]?.endsWith('verify-exact-deployment-run.mjs')) await main();
