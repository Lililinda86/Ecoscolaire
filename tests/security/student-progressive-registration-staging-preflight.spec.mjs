import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyHttpTransportError,
  describeHttpTransportError,
  inspectUiHttpPreflight,
  resolveExpectedStagingSha,
  selectStagingVercelUrl
} from './student-progressive-registration-staging-preflight-contract.mjs';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const STAGING_URL = 'https://ecoscolaire-abc123-linda-lemofouet-s-projects.vercel.app';
const ECOSCOLAIRE_HTML = '<!doctype html><title>EcoScolaire</title><div id="root"></div><script src="/assets/index-abc123.js"></script>';

function expectCode(code, action) {
  assert.throws(action, error => error?.code === code);
}

function vercelDeployment(overrides = {}) {
  return {
    creatorLogin: 'vercel[bot]',
    sha: SHA,
    ref: SHA,
    environment: 'Preview',
    productionEnvironment: false,
    statuses: [{ state: 'success', environment: 'Preview', environmentUrl: STAGING_URL }],
    ...overrides
  };
}

test('old hardcoded deployment inputs are absent from the harness', () => {
  const script = readFileSync(new URL('../../scripts/test-student-progressive-registration-staging.mjs', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../../.github/workflows/student-progressive-registration-staging-ui.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /const EXPECTED_(?:SHA|URL)\s*=/);
  assert.doesNotMatch(workflow, /^\s*STAGING_URL:\s*https:/m);
  assert.doesNotMatch(workflow, /^\s*EXPECTED_STAGING_SHA:\s*[a-f0-9]{40}\s*$/im);
});

test('workflow_dispatch accepts a required dynamic exact Staging SHA', () => {
  assert.equal(resolveExpectedStagingSha({
    eventName: 'workflow_dispatch',
    githubSha: OTHER_SHA,
    githubRef: 'refs/heads/staging',
    dispatchSha: SHA
  }), SHA);
});

test('manual validation without an exact SHA is denied', () => {
  expectCode('MISSING_OR_INVALID_EXPECTED_SHA', () => resolveExpectedStagingSha({
    eventName: 'workflow_dispatch',
    githubSha: SHA,
    githubRef: 'refs/heads/staging',
    dispatchSha: ''
  }));
});

test('manual validation from a non-Staging ref is denied', () => {
  expectCode('INVALID_STAGING_TRIGGER', () => resolveExpectedStagingSha({
    eventName: 'workflow_dispatch',
    githubSha: SHA,
    githubRef: 'refs/heads/main',
    dispatchSha: SHA
  }));
});

test('wrong SHA is denied before deployment selection', () => {
  expectCode('WRONG_STAGING_SHA', () => selectStagingVercelUrl({
    expectedSha: SHA,
    branchSha: OTHER_SHA,
    stagingDeploymentPass: true,
    deployments: [vercelDeployment()]
  }));
});

test('missing official Staging deployment is denied', () => {
  expectCode('FIREBASE_DEPLOYMENT_NOT_PASS', () => selectStagingVercelUrl({
    expectedSha: SHA,
    branchSha: SHA,
    stagingDeploymentPass: false,
    deployments: [vercelDeployment()]
  }));
});

test('Production Vercel deployment is denied', () => {
  expectCode('PRODUCTION_URL_FORBIDDEN', () => selectStagingVercelUrl({
    expectedSha: SHA,
    branchSha: SHA,
    stagingDeploymentPass: true,
    deployments: [vercelDeployment({ environment: 'Production', productionEnvironment: true })]
  }));
});

test('successful deployment without immutable URL is denied', () => {
  expectCode('MISSING_IMMUTABLE_URL', () => selectStagingVercelUrl({
    expectedSha: SHA,
    branchSha: SHA,
    stagingDeploymentPass: true,
    deployments: [vercelDeployment({ statuses: [{ state: 'success', environment: 'Preview', environmentUrl: '' }] })]
  }));
});

test('Preview from an unrelated branch or SHA is denied', () => {
  expectCode('VERCEL_DEPLOYMENT_NOT_PASS', () => selectStagingVercelUrl({
    expectedSha: SHA,
    branchSha: SHA,
    stagingDeploymentPass: true,
    deployments: [vercelDeployment({ ref: OTHER_SHA, sha: OTHER_SHA })]
  }));
});

test('protected URL without bypass is denied before browser', () => {
  expectCode('MISSING_VERCEL_BYPASS_SECRET', () => inspectUiHttpPreflight({
    selectedUrl: STAGING_URL,
    finalUrl: STAGING_URL,
    status: 200,
    body: ECOSCOLAIRE_HTML,
    bypassSecretPresent: false
  }));
});

test('exact-SHA Staging URL with bypass and EcoScolaire app passes', () => {
  assert.equal(selectStagingVercelUrl({
    expectedSha: SHA,
    branchSha: SHA,
    stagingDeploymentPass: true,
    deployments: [vercelDeployment()]
  }), STAGING_URL);
  assert.equal(inspectUiHttpPreflight({
    selectedUrl: STAGING_URL,
    finalUrl: `${STAGING_URL}/`,
    status: 200,
    body: ECOSCOLAIRE_HTML,
    bypassSecretPresent: true
  }).code, 'PASS');
});

test('Vercel login response remains denied even when bypass was supplied', () => {
  expectCode('VERCEL_PROTECTED_URL', () => inspectUiHttpPreflight({
    selectedUrl: STAGING_URL,
    finalUrl: 'https://vercel.com/login',
    status: 200,
    body: '<title>Login - Vercel</title>',
    bypassSecretPresent: true
  }));
});

test('wrong bypass is denied when Vercel returns its protected login', () => {
  expectCode('VERCEL_PROTECTED_URL', () => inspectUiHttpPreflight({
    selectedUrl: STAGING_URL,
    finalUrl: 'https://vercel.com/login',
    status: 200,
    body: '<title>Login - Vercel</title>',
    bypassSecretPresent: true
  }));
});

test('network failures surface the complete safe nested cause', () => {
  const cause = Object.assign(new Error('getaddrinfo ENOTFOUND immutable.example'), {
    code: 'ENOTFOUND',
    errno: -3008,
    syscall: 'getaddrinfo',
    hostname: 'immutable.example'
  });
  const error = new TypeError('fetch failed', { cause });
  assert.deepEqual(describeHttpTransportError(error), {
    error: {
      name: 'TypeError',
      message: 'fetch failed'
    },
    cause: {
      name: 'Error',
      message: 'getaddrinfo ENOTFOUND immutable.example',
      code: 'ENOTFOUND',
      errno: -3008,
      syscall: 'getaddrinfo',
      hostname: 'immutable.example'
    }
  });
  assert.equal(classifyHttpTransportError(error), 'STAGING_UI_NETWORK_FAILURE');
});

test('transport timeout receives an explicit timeout classification', () => {
  const error = Object.assign(new Error('apiRequestContext.get: Timeout 10000ms exceeded.'), {
    name: 'TimeoutError'
  });
  assert.equal(classifyHttpTransportError(error), 'STAGING_UI_PREFLIGHT_TIMEOUT');
});

test('workflow declares required exact-SHA manual input', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/student-progressive-registration-staging-ui.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^\s*workflow_dispatch:\s*$/m);
  assert.match(workflow, /^\s*expected_sha:\s*$/m);
  assert.match(workflow, /^\s*required:\s*true\s*$/m);
  assert.match(workflow, /EXPECTED_STAGING_SHA:\s*\$\{\{\s*inputs\.expected_sha\s*\}\}/);
});

test('connectivity-only mode cannot launch browser, authenticate, run scenarios, or upload functional evidence', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/student-progressive-registration-staging-ui.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^\s*connectivity_only:\s*$/m);
  assert.match(workflow, /connectivity_only:[\s\S]*?type:\s*boolean/);
  for (const stepName of [
    'Test Staging UI preflight contract',
    'Install Chromium',
    'Authenticate Firebase Staging',
    'Run the single Staging UI validation'
  ]) {
    const step = workflow.slice(workflow.indexOf(`- name: ${stepName}`));
    assert.match(step.slice(0, step.indexOf('\n\n')), /if:\s*\$\{\{\s*!inputs\.connectivity_only\s*\}\}/);
  }
  assert.match(workflow, /if:\s*\$\{\{\s*!inputs\.connectivity_only\s*&&\s*always\(\)\s*\}\}/);
});
