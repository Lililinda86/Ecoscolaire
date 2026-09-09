import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
it('blocks missing target, Production, and unconfirmed reference imports before authentication', () => {
  for (const args of [[], ['--project=ecoscolaire-c5861'], ['--project=ecoscolaire-staging', '--apply']]) {
    const result = spawnSync(process.execPath, ['scripts/pedagogy-verified-catalog-import.mjs', ...args], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Explicit Staging project required|Explicit reference import confirmation required/);
    expect(result.stdout).toBe('');
  }
});
