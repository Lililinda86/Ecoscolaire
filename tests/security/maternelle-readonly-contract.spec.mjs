import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { assertReadOnlyRun, classifyReadOnlyRequest, selectReadOnlyPreview, redactReadOnlyError, FEATURE_REF } from '../helpers/maternelleReadOnly.mjs';

const sha = 'a'.repeat(40);
const origin = 'https://ecoscolaire-example-linda-lemofouet-s-projects.vercel.app';
const settings = { appOrigin: origin, apiKey: 'test-only-api-key', storageBucket: 'ecoscolaire-staging.firebasestorage.app' };
const classify = (url, method = 'POST') => classifyReadOnlyRequest(url, method, settings);
const firestore = 'https://firestore.googleapis.com/v1/projects/ecoscolaire-staging/databases/(default)/documents';
const env = { GITHUB_SHA: sha, GITHUB_REF: FEATURE_REF, GITHUB_REPOSITORY: 'Lililinda86/Ecoscolaire', STAGING_FIREBASE_PROJECT_ID: 'ecoscolaire-staging' };

test('only exact-SHA feature or staging runs are allowed', () => {
  assert.equal(assertReadOnlyRun(env), 'pre-merge');
  assert.equal(assertReadOnlyRun({ ...env, GITHUB_REF: 'refs/heads/staging' }), 'post-merge');
  for (const changes of [{ GITHUB_REF: 'refs/heads/main' }, { GITHUB_SHA: 'main' }, { STAGING_FIREBASE_PROJECT_ID: 'ecoscolaire-c5861' }, { GITHUB_REPOSITORY: 'another/repo' }]) assert.throws(() => assertReadOnlyRun({ ...env, ...changes }));
});

test('explicit Firestore reads pass and writes or other projects are denied', () => {
  for (const operation of ['runQuery', 'runAggregationQuery', 'batchGet']) assert.equal(classify(`${firestore}:${operation}`), 'read');
  assert.equal(classify(`${firestore}/classes/test-class`, 'GET'), 'read');
  for (const operation of ['commit', 'batchWrite', 'beginTransaction', 'rollback']) assert.equal(classify(`${firestore}:${operation}`), 'forbidden-write');
  for (const method of ['PATCH', 'DELETE']) assert.equal(classify(`${firestore}/classes/test-class`, method), 'forbidden-write');
  assert.equal(classify(firestore.replace('ecoscolaire-staging', 'ecoscolaire-c5861'), 'GET'), 'forbidden-production');
  assert.equal(classify(firestore.replace('ecoscolaire-staging', 'other-project'), 'GET'), 'forbidden-project');
  const channel = 'https://firestore.googleapis.com/google.firestore.v1.Firestore/';
  assert.equal(classify(`${channel}Listen/channel?database=projects%2Fecoscolaire-staging%2Fdatabases%2F(default)`), 'read');
  assert.equal(classify(`${channel}Write/channel?database=projects%2Fecoscolaire-staging%2Fdatabases%2F(default)`), 'forbidden-write');
});

test('real sign-in passes but account changes and business callables are denied', () => {
  for (const operation of ['signInWithPassword', 'lookup']) assert.equal(classify(`https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=test-only-api-key`), 'auth');
  for (const operation of ['signUp', 'update', 'delete', 'sendOobCode']) assert.equal(classify(`https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=test-only-api-key`), 'forbidden-auth-change');
  assert.equal(classify('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=other-key'), 'forbidden-project');
  assert.equal(classify('https://europe-west1-ecoscolaire-staging.cloudfunctions.net/recordAuthenticatedAudit'), 'blocked-login-audit');
  assert.equal(classify('https://europe-west1-ecoscolaire-staging.cloudfunctions.net/createStudentSecure'), 'forbidden-write');
  assert.equal(classify(`${origin}/save`), 'forbidden-write');
});

test('preview must be an immutable successful non-production deployment for this SHA', () => {
  const deployment = { sha, creator: { login: 'vercel[bot]' }, production_environment: false, environment: 'Preview', statuses: [{ state: 'success', environment: 'Preview', environment_url: origin }] };
  assert.equal(selectReadOnlyPreview([deployment], sha), origin);
  assert.equal(selectReadOnlyPreview([{ ...deployment, sha: 'b'.repeat(40) }], sha), null);
  assert.throws(() => selectReadOnlyPreview([{ ...deployment, production_environment: true }], sha));
  assert.throws(() => selectReadOnlyPreview([{ ...deployment, statuses: [{ ...deployment.statuses[0], environment_url: 'https://unapproved.example' }] }], sha));
});

test('error redaction removes credentials and query tokens', () => {
  const redacted = redactReadOnlyError(new Error('password-fixture bearer-fixture https://example.test/?key=another-key&token=private-token'), { TEST_PASSWORD: 'password-fixture', GITHUB_TOKEN: 'bearer-fixture' });
  for (const value of ['password-fixture', 'bearer-fixture', 'another-key', 'private-token']) assert.ok(!redacted.includes(value));
});

test('workflow uses neither privileged service account nor data artifact export', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/maternelle-labels-readonly.yml', import.meta.url), 'utf8');
  assert.ok(!workflow.includes('SERVICE_ACCOUNT'));
  assert.ok(!workflow.includes('upload-artifact'));
  assert.match(workflow, /branches: \[codex\/maternelle-labels-audit, staging\]/);
  assert.ok(!workflow.includes('pull_request_target'));
  const parsed = yaml.load(workflow);
  assert.equal(parsed.jobs['visual-readonly'].if, "github.ref == 'refs/heads/codex/maternelle-labels-audit' || contains(github.event.head_commit.message, 'Merge pull request #201 ')");
});
