import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const revokedCredentialFingerprints = Object.freeze({
  alpha: 'd9e0b4fcba01e3b22ecf6aa06c8ac6c227ba2411d0d6d1dfbfeb10473e2babc2',
  superAdmin: '617966eeb007e077ec4eb316b051a48ac5d2ff615a5e93e229a2a65edf2d47fd',
  beta: '6dedea92f5d209549ef6664bbf7bb4554819ff6d9c41c7daac0fc7db4bf5aa96',
  previouslyBlocked: '5ee85a6269555ad89ffc17ae3049fcd4f64f9a580d02b857a4d3249a51c9754e',
});
export const blockedFingerprints = new Set(Object.values(revokedCredentialFingerprints));
const allowedStructuralFixtures = new Set([
  'tests/security/auth-rbac.spec.mjs',
  'refactor-login.cjs',
]);

export function fingerprintCredential(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function inspectSource(file, source, fingerprints = blockedFingerprints) {
  const findings = [];
  for (const match of source.matchAll(/(['"\x60])([^'"\x60\r\n]{6,})\1/g)) {
    if (fingerprints.has(fingerprintCredential(match[2]))) {
      findings.push(`${file}: revoked credential literal`);
    }
  }

  if (!/\.(?:ts|tsx|js|mjs|cjs)$/.test(file) || allowedStructuralFixtures.has(file)) return findings;
  if (/process\.env\.[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN)[A-Z0-9_]*\s*(?:\|\||\?\?)\s*['"][^'"]+['"]/i.test(source)) {
    findings.push(`${file}: hardcoded environment fallback`);
  }
  if (/(?:loginAs|signInWithEmailAndPassword)\([^\n]*,\s*['"][^'"]{6,}['"]\s*\)/i.test(source)) {
    findings.push(`${file}: hardcoded authentication argument`);
  }
  return findings;
}

export function secretGuardExitCode(findings) {
  return findings.length > 0 ? 1 : 0;
}

export function runSecretGuard(root = process.cwd()) {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'));
  const findings = [];

  for (const file of files) {
    const fullPath = path.join(root, file);
    let source;
    try { source = fs.readFileSync(fullPath, 'utf8'); } catch { continue; }
    findings.push(...inspectSource(file, source));
  }

  return { files, findings: [...new Set(findings)] };
}

function main() {
  const { files, findings } = runSecretGuard();
  if (findings.length) {
    console.error('Secret regression guard failed.');
    for (const finding of findings) console.error(`- ${finding}`);
  } else {
    console.log(`Secret regression guard passed: ${files.length} tracked files scanned.`);
  }
  process.exitCode = secretGuardExitCode(findings);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
