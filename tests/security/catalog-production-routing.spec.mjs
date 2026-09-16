import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { isAuthorizedCatalogRelease, RELEASE_INFRASTRUCTURE } from '../../scripts/catalog-production-routing.mjs';
const workflow = fs.readFileSync('.github/workflows/firebase-deploy.yml', 'utf8');
test('Catalogue routing accepts only the exact approved source and bounded release infrastructure', () => {
  assert.equal(isAuthorizedCatalogRelease([]), true);
  assert.equal(isAuthorizedCatalogRelease([...RELEASE_INFRASTRUCTURE]), true);
  for (const file of ['src/pages/Grades.tsx', 'src/components/Settings/SchoolFeeCatalog.tsx', 'functions/src/schoolFeeCatalog.ts', 'functions/src/index.ts', 'firestore.rules', 'package.json']) assert.equal(isAuthorizedCatalogRelease([file]), false, file);
});
test('Catalogue deploys exactly its two callables and retains backup, ACTIVE, Rules and frontend gates', () => {
  const route = workflow.slice(workflow.indexOf('# Exact human-validated Catalogue'), workflow.indexOf('# Exact approved frontend-only Transport'));
  assert.ok(route.includes('node scripts/catalog-production-routing.mjs'));
  assert.ok(route.includes("echo 'targets=functions:manageSchoolFee,functions:getSchoolFeeCatalog'"));
  assert.ok(route.includes("echo 'enabled=true'"));
  assert.ok(!route.includes('verification_only=true'));
  assert.ok(workflow.includes('node scripts/verify-production-backup-gate.mjs'));
  assert.ok(workflow.includes('Verify every limited Function is ACTIVE'));
  assert.ok(workflow.includes('node scripts/verify-production-rules-source.mjs'));
  assert.ok(workflow.includes("if: steps.limited.outputs.enabled != 'true' # LIMITED_RELEASE_LEGACY_GUARD"));
});
