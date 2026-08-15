import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const revokedHashes = new Set(["d9e0b4fcba01e3b22ecf6aa06c8ac6c227ba2411d0d6d1dfbfeb10473e2babc2","617966eeb007e077ec4eb316b051a48ac5d2ff615a5e93e229a2a65edf2d47fd","5ee85a6269555ad89ffc17ae3049fcd4f64f9a580d02b857a4d3249a51c9754e"]);
const allowedStructuralFixtures = new Set([
  'tests/security/auth-rbac.spec.mjs',
  'refactor-login.cjs',
]);
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .map((file) => file.replaceAll('\\', '/'));
const findings = [];

for (const file of files) {
  const fullPath = path.join(root, file);
  let source;
  try { source = fs.readFileSync(fullPath, 'utf8'); } catch { continue; }

  for (const match of source.matchAll(/(['"\x60])([^'"\x60\r\n]{6,})\1/g)) {
    const fingerprint = crypto.createHash('sha256').update(match[2]).digest('hex');
    if (revokedHashes.has(fingerprint)) findings.push(`${file}: revoked credential literal`);
  }

  if (!/\.(?:ts|tsx|js|mjs|cjs)$/.test(file) || allowedStructuralFixtures.has(file)) continue;
  if (/process\.env\.[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN)[A-Z0-9_]*\s*(?:\|\||\?\?)\s*['"][^'"]+['"]/i.test(source)) {
    findings.push(`${file}: hardcoded environment fallback`);
  }
  if (/(?:loginAs|signInWithEmailAndPassword)\([^\n]*,\s*['"][^'"]{6,}['"]\s*\)/i.test(source)) {
    findings.push(`${file}: hardcoded authentication argument`);
  }
}

if (findings.length) {
  console.error('Secret regression guard failed.');
  for (const finding of [...new Set(findings)]) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Secret regression guard passed: ${files.length} tracked files scanned.`);
