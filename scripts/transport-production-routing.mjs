import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export const TRANSPORT_SOURCE = '872692c5897c6283ec761d1193aeb0ae5a7790e9';
export const TRANSPORT_BASE = '8965b81e2fd49a0c84b7f3c8c0b6fb859ac1f802';
export const RELEASE_INFRASTRUCTURE = new Set([
  '.github/workflows/firebase-deploy.yml', '.github/workflows/ci.yml',
  'scripts/transport-production-routing.mjs', 'tests/security/transport-production-routing.spec.mjs'
]);
export const isAuthorizedTransportRelease = changedFiles => changedFiles.every(file => RELEASE_INFRASTRUCTURE.has(file));
export function verifyTransportRelease() {
  const matches = reference => isAuthorizedTransportRelease(execFileSync('git', ['diff', '--name-only', reference, 'HEAD'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean));
  // Also supports a rollback restoring the exact pre-release tree while retaining these gates.
  if (!matches(TRANSPORT_SOURCE) && !matches(TRANSPORT_BASE)) return false;
  // This release changes only frontend persistence. Backend and Rules are already deployed.
  execFileSync('git', ['diff', '--exit-code', TRANSPORT_BASE, TRANSPORT_SOURCE, '--',
    'functions', 'firestore.rules', 'storage.rules', 'firestore.indexes.json', 'firebase.json', 'package.json', 'package-lock.json'], { stdio: 'pipe' });
  return true;
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exitCode = verifyTransportRelease() ? 0 : 1;
