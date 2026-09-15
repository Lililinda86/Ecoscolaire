import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
test('catalogue candidate changes only the authorized publication chain and its tests', () => {
  const allowed = new Set(['.github/workflows/catalog-persistence-staging.yml', 'functions/src/schoolFeeCatalog.ts',
    'src/components/Settings/SchoolFeeCatalog.tsx', 'scripts/test-all-school-fees-staging.mjs',
    'tests/functions/test-all-school-fees.cjs', 'tests/unit/CatalogPersistence.spec.tsx', 'tests/security/catalog-persistence-release.spec.mjs']);
  const changed = execFileSync('git', ['diff', '--name-only', '2eae3051d97694ab89c14e910ded17b502350b37', 'HEAD'], {encoding:'utf8'}).trim().split('\n');
  assert.deepEqual(changed.filter(f => !allowed.has(f)), []);
});
test('catalogue workflow is guarded to Staging and deploys only its two callables', () => {
  const source = fs.readFileSync('.github/workflows/catalog-persistence-staging.yml','utf8');
  assert.ok(source.includes('test "$GOOGLE_CLOUD_PROJECT" = ecoscolaire-staging'));
  assert.ok(source.includes("if: github.ref == 'refs/heads/codex/catalog-persistence'"));
  assert.ok(source.includes('--only functions:manageSchoolFee,functions:getSchoolFeeCatalog --project ecoscolaire-staging'));
  assert.ok(!source.includes('--project ecoscolaire-c5861'));
  assert.ok(source.includes('if: always()'));
});
