import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Local proof only, no deploy, no data mutation, no real provider request.
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const folder = resolve('docs/pedagogy-finalization/evidence', `verification-${sha}`);
mkdirSync(folder, { recursive: true });
const checks = [
  ['types', 'npm run typecheck'],
  ['lint', 'npx eslint "functions/src/pedagogy/**/*.ts" "src/features/pedagogy/**/*.{ts,tsx}" "tests/unit/pedagogy*.spec.ts" "tests/unit/GradesGradeEntryValidation.spec.tsx" "tests/unit/GradesSubjects.spec.tsx" "tests/security/pedagogy-lot-c-rules.spec.mjs" --max-warnings=0'],
  ['unit', 'npm run test:unit'],
  ['functions', 'npm run test:functions'],
  ['staging-build', 'npm run build:staging'],
];
const evidence = { sha, startedAt: new Date().toISOString(), environment: 'local-windows', checks: [],
  notExecuted: ['Firestore/Storage rules (Windows emulator startup failure; Linux CI required)', 'Functions emulator integration', 'Browser E2E', 'Real AI provider', 'Friday scheduler', 'Document watch', 'Staging deployment and exact SHA validation'], productionActionsPerformed: false };
for (const [name, command] of checks) {
  const startedAt = new Date().toISOString();
  console.log(`START ${name}`);
  const result = await new Promise(resolveResult => {
    const child = spawn(process.platform === 'win32' ? 'powershell.exe' : 'sh', process.platform === 'win32' ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command], {
      cwd: process.cwd(), env: { ...process.env, DEBUG_PRINT_LIMIT: '500', NO_COLOR: '1' }, windowsHide: true,
    });
    let log = '';
    child.stdout.on('data', data => { log += data.toString(); });
    child.stderr.on('data', data => { log += data.toString(); });
    child.on('error', error => resolveResult({ exitCode: null, log: `${log}\n${error.message}` }));
    child.on('close', exitCode => resolveResult({ exitCode, log }));
  });
  writeFileSync(resolve(folder, `${name}.log`), result.log);
  const record = { name, command, startedAt, endedAt: new Date().toISOString(), exitCode: result.exitCode, status: result.exitCode === 0 ? 'PASS' : 'FAIL', logSha256: createHash('sha256').update(result.log).digest('hex') };
  evidence.checks.push(record);
  writeFileSync(resolve(folder, 'manifest.json'), JSON.stringify(evidence, null, 2));
  console.log(`${record.status} ${name}`);
}
evidence.completedAt = new Date().toISOString();
writeFileSync(resolve(folder, 'manifest.json'), JSON.stringify(evidence, null, 2));
console.log(`Evidence: ${folder}`);
if (evidence.checks.some(check => check.status !== 'PASS')) process.exitCode = 1;
