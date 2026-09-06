import { expect } from '@playwright/test';
import { selectReadOnlyPreview } from './maternelleReadOnly.mjs';

type Deployment = { id: number; sha: string; creator: { login: string }; production_environment: boolean; environment: string; statuses?: unknown[] };
async function githubGet<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com/repos/Lililinda86/Ecoscolaire/${path}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`GitHub metadata HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function exactReadOnlyPreview(phase: 'pre-merge' | 'post-merge') {
  const sha = process.env.GITHUB_SHA!;
  let result: string | null = null;
  await expect.poll(async () => {
    const deployments = await githubGet<Deployment[]>(`deployments?sha=${sha}&per_page=10`);
    for (const deployment of deployments) deployment.statuses = await githubGet<unknown[]>(`deployments/${deployment.id}/statuses?per_page=10`);
    result = selectReadOnlyPreview(deployments, sha);
    if (!result) return false;
    if (phase === 'post-merge') {
      const ref = await githubGet<{ object: { sha: string } }>('git/ref/heads/staging');
      expect(ref.object.sha).toBe(sha);
      const runs = await githubGet<{ workflow_runs: { head_sha: string; status: string; conclusion: string }[] }>(`actions/workflows/deploy-staging.yml/runs?head_sha=${sha}&per_page=10`);
      return runs.workflow_runs.some(run => run.head_sha === sha && run.status === 'completed' && run.conclusion === 'success');
    }
    return true;
  }, { timeout: 420_000, intervals: [5000, 10000, 15000], message: 'Exact-SHA Staging-backed Vercel deployment must succeed' }).toBe(true);
  return result!;
}
