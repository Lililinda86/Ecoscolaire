import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = new URL('../../', import.meta.url);
const brokerDir = new URL('../../functions-staging-transport/src/', import.meta.url);
const brokerSrcFiles = fs.readdirSync(brokerDir).filter((name) => name.endsWith('.ts'));
const brokerSources = Object.fromEntries(
  brokerSrcFiles.map((name) => [name, fs.readFileSync(new URL(name, brokerDir), 'utf8')]),
);
const allBrokerSource = Object.values(brokerSources).join('\n');

const firebaseJson = fs.readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8');
const firebaseDeployWorkflow = fs.readFileSync(new URL('../../.github/workflows/firebase-deploy.yml', import.meta.url), 'utf8');
const deployStagingWorkflow = fs.readFileSync(new URL('../../.github/workflows/deploy-staging.yml', import.meta.url), 'utf8');

test('broker codebase exists with every required Phase 1 module', () => {
  for (const file of [
    'index.ts', 'apiSchema.ts', 'runtimeGuards.ts', 'manifest.ts', 'stateMachine.ts',
    'prepare.ts', 'inspect.ts', 'cleanup.ts', 'verifyCleanup.ts',
  ]) {
    assert.ok(brokerSrcFiles.includes(file), `missing broker module ${file}`);
  }
});

test('broker source never imports firebase-admin/firebase-functions (not wired for deployment in Phase 1)', () => {
  assert.doesNotMatch(allBrokerSource, /from ['"]firebase-admin/);
  assert.doesNotMatch(allBrokerSource, /from ['"]firebase-functions/);
  assert.doesNotMatch(allBrokerSource, /require\(['"]firebase-admin/);
  assert.doesNotMatch(allBrokerSource, /require\(['"]firebase-functions/);
});

test('broker never marks itself public (no allUsers/public invoker references)', () => {
  assert.doesNotMatch(allBrokerSource, /invoker:\s*\[?['"]allUsers['"]/);
  assert.doesNotMatch(allBrokerSource, /invoker:\s*['"]public['"]/);
});

test('broker runtime guard explicitly rejects Production and has no fallback project', () => {
  const runtimeGuards = brokerSources['runtimeGuards.ts'];
  assert.match(runtimeGuards, /PRODUCTION_PROJECT_REJECTED/);
  assert.match(runtimeGuards, /NO_RUNTIME_PROJECT_IDENTIFIER/);
  assert.match(runtimeGuards, /STAGING_PROJECT_ID = 'ecoscolaire-staging'/);
  assert.match(runtimeGuards, /PRODUCTION_PROJECT_ID = 'ecoscolaire-c5861'/);
  assert.doesNotMatch(runtimeGuards, /\?\?\s*STAGING_PROJECT_ID/);
});

test('broker cleanup uses a hard-coded collection allow-list and no recursive delete primitive', () => {
  const cleanup = brokerSources['cleanup.ts'];
  assert.match(cleanup, /ALLOWED_CLEANUP_COLLECTIONS = Object\.freeze/);
  assert.doesNotMatch(cleanup, /recursiveDelete/);
  assert.doesNotMatch(cleanup, /deleteCollection/);
});

test('firebase.json does not declare the broker as a Firebase functions codebase', () => {
  const parsed = JSON.parse(firebaseJson);
  const sources = (parsed.functions ?? []).map((entry) => entry.source);
  assert.ok(!sources.includes('functions-staging-transport'), 'firebase.json must not reference the broker codebase');
  assert.doesNotMatch(firebaseJson, /functions-staging-transport/);
});

test('Production deploy workflow never references the broker', () => {
  for (const forbidden of ['functions-staging-transport', 'transport-fixtures', 'transportFixtureLifecycle', 'transportReleaseRuns']) {
    assert.doesNotMatch(firebaseDeployWorkflow, new RegExp(forbidden));
  }
});

test('Production deploy workflow uses an explicit function allow-list, never a bare --only functions', () => {
  assert.doesNotMatch(firebaseDeployWorkflow, /--only\s+functions(?![:a-zA-Z])/);
  assert.match(firebaseDeployWorkflow, /--only firestore:rules,functions:createStudentSecure/);
});

test('broker operation names are absent from the Production function allow-list', () => {
  const onlyLineMatch = firebaseDeployWorkflow.match(/--only\s+([^\s"]+)/);
  assert.ok(onlyLineMatch, 'Production deploy --only clause not found');
  const allowedTargets = onlyLineMatch[1].split(',');
  for (const brokerName of ['prepare', 'inspect', 'cleanup', 'verifyCleanup']) {
    assert.ok(!allowedTargets.includes(`functions:${brokerName}`), `broker operation ${brokerName} must not be Production-deployable`);
  }
});

test('Staging deploy workflow does not reference the broker either (Phase 1 deploys nothing)', () => {
  for (const forbidden of ['functions-staging-transport', 'transport-fixtures:prepare', 'transportFixtureLifecycle']) {
    assert.doesNotMatch(deployStagingWorkflow, new RegExp(forbidden));
  }
});

test('broker package is private and not part of any npm workspaces publish surface', () => {
  const pkgPath = path.join(new URL(repoRoot).pathname, 'functions-staging-transport', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.equal(pkg.private, true);
});
