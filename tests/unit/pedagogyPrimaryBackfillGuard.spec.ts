import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
it('rejects missing target, Production, and unconfirmed apply before authentication or network access', () => {
  for (const args of [[], ['--project=ecoscolaire-c5861'], ['--project=ecoscolaire-staging', '--apply']]) {
    const result = spawnSync(process.execPath, ['scripts/pedagogy-primary-level-backfill.mjs', ...args], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Explicit Staging project required|Explicit limited backfill confirmation required/);
    expect(result.stdout).toBe('');
  }
});
