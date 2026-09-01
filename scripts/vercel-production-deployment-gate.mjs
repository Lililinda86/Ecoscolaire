import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export const APPROVED_PRODUCTION_HOST =
  /^ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/;

const RETRYABLE_STATES = new Set(['pending', 'queued', 'in_progress']);
const FAILED_STATES = new Set(['error', 'failure', 'inactive', 'cancelled']);

const newestFirst = (items) => [...items].sort((left, right) => {
  const timeDifference = Date.parse(right?.created_at || '') - Date.parse(left?.created_at || '');
  if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
  return Number(right?.id || 0) - Number(left?.id || 0);
});

const isVercelIdentity = (deployment) => {
  if (deployment?.creator?.login !== 'vercel[bot]') return false;
  const appSlug = deployment?.performed_via_github_app?.slug;
  return appSlug == null || appSlug === 'vercel';
};

const isExactCandidate = (deployment, expectedSha) => deployment?.sha === expectedSha
  && deployment?.environment === 'Production'
  && (deployment?.original_environment == null
    || deployment.original_environment === 'Production')
  && isVercelIdentity(deployment);

export const validateImmutableProductionUrl = (value) => {
  assert.equal(typeof value, 'string', 'The Vercel deployment URL must be a string.');
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', 'The Vercel deployment URL must use HTTPS.');
  assert.match(url.hostname, APPROVED_PRODUCTION_HOST,
    'The deployment URL is not an approved immutable EcoScolaire Production hostname.');
  assert.equal(url.pathname, '/', 'The immutable deployment URL must not contain a path.');
  assert.equal(url.search, '', 'The immutable deployment URL must not contain a query.');
  assert.equal(url.hash, '', 'The immutable deployment URL must not contain a fragment.');
  return url.href;
};

export const evaluateVercelProductionSnapshot = ({
  deployments,
  statusesByDeploymentId,
}, { expectedSha } = {}) => {
  assert.match(expectedSha || '', /^[0-9a-f]{40}$/,
    'A full exact Production SHA is required.');
  assert.ok(Array.isArray(deployments), 'GitHub deployments must be an array.');
  assert.ok(statusesByDeploymentId && typeof statusesByDeploymentId === 'object',
    'GitHub deployment statuses must be keyed by deployment ID.');

  const candidates = newestFirst(deployments.filter((deployment) =>
    isExactCandidate(deployment, expectedSha)));
  if (candidates.length === 0) {
    return { outcome: 'retry', reason: 'No exact-SHA Vercel Production deployment exists yet.' };
  }

  let hasRetryableCandidate = false;
  const terminalFailures = [];
  for (const deployment of candidates) {
    const statuses = statusesByDeploymentId[String(deployment.id)];
    if (!Array.isArray(statuses) || statuses.length === 0) {
      hasRetryableCandidate = true;
      continue;
    }
    const currentStatus = newestFirst(statuses)[0];
    if (currentStatus?.state === 'success') {
      try {
        const immutableUrl = validateImmutableProductionUrl(currentStatus.environment_url);
        return { outcome: 'success', deployment, status: currentStatus, immutableUrl };
      } catch (error) {
        terminalFailures.push(`deployment ${deployment.id}: ${error.message}`);
      }
      continue;
    }
    if (RETRYABLE_STATES.has(currentStatus?.state)) {
      hasRetryableCandidate = true;
      continue;
    }
    const state = currentStatus?.state || '<missing>';
    if (FAILED_STATES.has(state)) {
      terminalFailures.push(`deployment ${deployment.id}: terminal state ${state}`);
    } else {
      terminalFailures.push(`deployment ${deployment.id}: unsupported state ${state}`);
    }
  }

  if (hasRetryableCandidate) {
    return { outcome: 'retry', reason: 'An exact Vercel Production deployment is not terminal yet.' };
  }
  return {
    outcome: 'failure',
    reason: `All exact Vercel Production deployments failed closed: ${terminalFailures.join('; ')}`,
  };
};

export const pollForExactVercelProductionDeployment = async ({
  expectedSha,
  intervalMs = 5_000,
  loadSnapshot,
  now = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  timeoutMs = 120_000,
} = {}) => {
  assert.equal(typeof loadSnapshot, 'function', 'A GitHub deployment snapshot loader is required.');
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs >= 0 && timeoutMs <= 600_000,
    'The polling timeout must be between 0 and 600000 milliseconds.');
  assert.ok(Number.isInteger(intervalMs) && intervalMs > 0,
    'The polling interval must be a positive integer.');
  const deadline = now() + timeoutMs;

  while (true) {
    const result = evaluateVercelProductionSnapshot(await loadSnapshot(), { expectedSha });
    if (result.outcome === 'success') return result;
    if (result.outcome === 'failure') throw new Error(result.reason);
    if (now() >= deadline) {
      throw new Error(`Timed out waiting for the exact Vercel Production deployment: ${result.reason}`);
    }
    await sleep(Math.min(intervalMs, Math.max(1, deadline - now())));
  }
};

const githubApi = async (repository, resource, token) => {
  const response = await fetch(`https://api.github.com/repos/${repository}${resource}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  assert.ok(response.ok, `GitHub API ${resource} failed with HTTP ${response.status}.`);
  return response.json();
};

export const loadGithubDeploymentSnapshot = async ({ expectedSha, repository, token }) => {
  assert.match(repository || '', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
    'An exact GitHub owner/repository is required.');
  assert.ok(token, 'GH_TOKEN is required for the Production deployment gate.');
  const query = new URLSearchParams({
    environment: 'Production',
    per_page: '100',
    sha: expectedSha,
  });
  const deployments = await githubApi(repository, `/deployments?${query}`, token);
  assert.ok(Array.isArray(deployments), 'The GitHub deployments response must be an array.');
  const candidates = deployments.filter((deployment) => isExactCandidate(deployment, expectedSha));
  const entries = await Promise.all(candidates.map(async (deployment) => [
    String(deployment.id),
    await githubApi(repository, `/deployments/${deployment.id}/statuses?per_page=100`, token),
  ]));
  return { deployments, statusesByDeploymentId: Object.fromEntries(entries) };
};

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  assert.ok(index >= 0 && process.argv[index + 1], `${name} is required.`);
  return process.argv[index + 1];
};

const main = async () => {
  const expectedSha = valueAfter('--expected-sha');
  const repository = valueAfter('--repository');
  const timeoutMs = Number(valueAfter('--timeout-ms'));
  const intervalMs = Number(valueAfter('--interval-ms'));
  const token = process.env.GH_TOKEN;
  const result = await pollForExactVercelProductionDeployment({
    expectedSha,
    intervalMs,
    loadSnapshot: () => loadGithubDeploymentSnapshot({ expectedSha, repository, token }),
    timeoutMs,
  });
  console.log(`Verified exact Vercel Production deployment ${result.deployment.id}: ${result.immutableUrl}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
