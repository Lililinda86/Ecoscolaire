import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
const base = '8965b81e2fd49a0c84b7f3c8c0b6fb859ac1f802';
const read = path => fs.readFileSync(path, 'utf8');
test('transport fix preserves backend business logic, RBAC, rules and historical tests', () => {
  const changes = execFileSync('git', ['diff', '--name-only', base, 'HEAD', '--', 'functions', 'firestore.rules', 'storage.rules', 'firestore.indexes.json', 'tests'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  assert.deepEqual(changes.sort(), ['tests/security/transport-policy-persistence-release.spec.mjs', 'tests/unit/transportSettings.spec.ts']);
});
test('isolated staging pipeline cannot publish Production', () => {
  const w = read('.github/workflows/transport-policy-persistence-staging.yml');
  assert.ok(w.includes('branches: [codex/transport-policy-persistence]'));
  assert.ok(w.includes('test "$GOOGLE_CLOUD_PROJECT" = ecoscolaire-staging'));
  assert.ok(w.includes('--only functions:manageSchoolFee --project ecoscolaire-staging'));
  assert.ok(!w.includes('ecoscolaire-c5861'));
  assert.ok(w.includes('verify-limited-staging-preview.mjs'));
});
test('financial settings source of truth is verified from server, never cache fallback', () => {
  const source = read('src/services/transportSettings.ts');
  assert.ok(source.includes('getDocFromServer'));
  assert.ok(source.includes("'manageSchoolFee'"));
  assert.ok(source.includes('expectedVersion'));
  assert.ok(!source.includes('setDoc('));
});
