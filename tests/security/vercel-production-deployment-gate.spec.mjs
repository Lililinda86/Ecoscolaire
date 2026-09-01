import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateVercelProductionSnapshot,
  pollForExactVercelProductionDeployment,
} from '../../scripts/vercel-production-deployment-gate.mjs';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const URL = 'https://ecoscolaire-fgsydelt4-linda-lemofouet-s-projects.vercel.app/';

const vercelDeployment = (overrides = {}) => ({
  id: 100,
  sha: SHA,
  environment: 'Production',
  original_environment: 'Production',
  creator: { login: 'vercel[bot]', type: 'Bot' },
  performed_via_github_app: { slug: 'vercel' },
  created_at: '2026-09-01T12:21:02Z',
  ...overrides,
});
const selfDeployment = () => ({
  id: 200,
  sha: SHA,
  environment: 'Production',
  creator: { login: 'Lililinda86', type: 'User' },
  performed_via_github_app: { slug: 'github-actions' },
  created_at: '2026-09-01T12:25:55Z',
});
const status = (state = 'success', environmentUrl = URL, overrides = {}) => ({
  id: 500,
  state,
  environment_url: environmentUrl,
  created_at: '2026-09-01T12:21:02Z',
  ...overrides,
});
const snapshot = ({ deployment = vercelDeployment(), deployments, statuses } = {}) => ({
  deployments: deployments || [deployment],
  statusesByDeploymentId: statuses || { [deployment.id]: [status()] },
});

const evaluate = (value) => evaluateVercelProductionSnapshot(value, { expectedSha: SHA });

test('selects exact Vercel deployment despite a newer GitHub Actions self-deployment', () => {
  const result = evaluate(snapshot({
    deployments: [selfDeployment(), vercelDeployment()],
    statuses: { 100: [status()] },
  }));
  assert.equal(result.outcome, 'success');
  assert.equal(result.deployment.id, 100);
  assert.equal(result.immutableUrl, URL);
});

test('only a GitHub Actions self-deployment never satisfies the gate', () => {
  assert.equal(evaluate(snapshot({ deployments: [selfDeployment()], statuses: {} })).outcome, 'retry');
});

test('wrong or short SHA never satisfies the exact full-SHA gate', () => {
  assert.equal(evaluate(snapshot({ deployment: vercelDeployment({ sha: OTHER_SHA }) })).outcome, 'retry');
  assert.throws(() => evaluateVercelProductionSnapshot(snapshot(), { expectedSha: SHA.slice(0, 7) }));
});

test('Preview environment is rejected', () => {
  assert.equal(evaluate(snapshot({ deployment: vercelDeployment({
    environment: 'Preview', original_environment: 'Preview',
  }) })).outcome, 'retry');
});

test('wrong project hostname and missing URL fail closed', () => {
  for (const environmentUrl of [
    'https://unrelated-fgsydelt4-linda-lemofouet-s-projects.vercel.app/',
    'http://ecoscolaire-fgsydelt4-linda-lemofouet-s-projects.vercel.app/',
    '',
    null,
  ]) {
    assert.equal(evaluate(snapshot({ statuses: { 100: [status('success', environmentUrl)] } })).outcome,
      'failure');
  }
});

test('failed, cancelled and inactive Vercel deployments fail closed', () => {
  for (const state of ['failure', 'error', 'cancelled', 'inactive']) {
    assert.equal(evaluate(snapshot({ statuses: { 100: [status(state, '')] } })).outcome, 'failure');
  }
});

test('current status wins over an older success status', () => {
  const statuses = { 100: [
    status('failure', '', { id: 502, created_at: '2026-09-01T12:22:00Z' }),
    status('success', URL, { id: 501, created_at: '2026-09-01T12:21:00Z' }),
  ] };
  assert.equal(evaluate(snapshot({ statuses })).outcome, 'failure');
});

test('pending deployment that becomes successful passes within the polling window', async () => {
  let clock = 0;
  let calls = 0;
  const loadSnapshot = async () => {
    const state = calls++ === 0 ? 'pending' : 'success';
    return snapshot({ statuses: { 100: [status(state, state === 'success' ? URL : '')] } });
  };
  const result = await pollForExactVercelProductionDeployment({
    expectedSha: SHA,
    intervalMs: 5,
    loadSnapshot,
    now: () => clock,
    sleep: async (milliseconds) => { clock += milliseconds; },
    timeoutMs: 10,
  });
  assert.equal(result.outcome, 'success');
});

test('pending or self-only deployment fails closed at the bounded timeout', async () => {
  for (const loadSnapshot of [
    async () => snapshot({ statuses: { 100: [status('in_progress', '')] } }),
    async () => snapshot({ deployments: [selfDeployment()], statuses: {} }),
  ]) {
    let clock = 0;
    await assert.rejects(() => pollForExactVercelProductionDeployment({
      expectedSha: SHA,
      intervalMs: 5,
      loadSnapshot,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
      timeoutMs: 10,
    }), /Timed out/);
  }
});

test('Vercel identity is required independently from the hostname', () => {
  const impostors = [
    vercelDeployment({ creator: { login: 'someone', type: 'User' } }),
    vercelDeployment({ performed_via_github_app: { slug: 'github-actions' } }),
  ];
  for (const deployment of impostors) {
    assert.equal(evaluate(snapshot({ deployment })).outcome, 'retry');
  }
});
