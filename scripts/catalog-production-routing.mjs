import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export const CATALOG_SOURCE = 'bee33fb89058d7c16735a4496b5ad2d45ee1dbdc';
export const RELEASE_INFRASTRUCTURE = new Set([
  '.github/workflows/firebase-deploy.yml', '.github/workflows/ci.yml',
  'scripts/catalog-production-routing.mjs', 'tests/security/catalog-production-routing.spec.mjs',
  'tests/security/catalog-persistence-release.spec.mjs'
]);
export const isAuthorizedCatalogRelease = changedFiles => changedFiles.every(file => RELEASE_INFRASTRUCTURE.has(file));
export function verifyCatalogRelease() {
  const changed = execFileSync('git', ['diff', '--name-only', CATALOG_SOURCE, 'HEAD'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  return isAuthorizedCatalogRelease(changed);
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exitCode = verifyCatalogRelease() ? 0 : 1;
