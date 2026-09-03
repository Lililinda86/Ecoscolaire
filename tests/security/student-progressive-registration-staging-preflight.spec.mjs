import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertExactStagingMetadata,
  inspectUiHttpPreflight
} from './student-progressive-registration-staging-preflight-contract.mjs';

const SHA = 'f4c1fc5ab70113f56165c4fcf38d44c1061ef9a2';
const STAGING_URL = 'https://ecoscolaire-8t5s71k88-linda-lemofouet-s-projects.vercel.app';
const ECOSCOLAIRE_HTML = '<!doctype html><title>EcoScolaire</title><div id="root"></div><script src="/assets/index-abc123.js"></script>';

function expectCode(code, action) {
  assert.throws(action, error => error?.code === code);
}

test('protected immutable URL fails during HTTP preflight', () => {
  expectCode('VERCEL_PROTECTED_URL', () => inspectUiHttpPreflight({
    configuredUrl: STAGING_URL,
    finalUrl: STAGING_URL,
    status: 401,
    body: '<title>Login – Vercel</title>',
    expectedUrl: STAGING_URL
  }));
});

test('redirect to vercel.com/login fails during HTTP preflight', () => {
  expectCode('VERCEL_PROTECTED_URL', () => inspectUiHttpPreflight({
    configuredUrl: STAGING_URL,
    finalUrl: 'https://vercel.com/login?next=%2Fprotected',
    status: 200,
    body: '<title>Login – Vercel</title>',
    expectedUrl: STAGING_URL
  }));
});

test('wrong SHA alias fails exact deployment metadata preflight', () => {
  expectCode('WRONG_STAGING_SHA', () => assertExactStagingMetadata({
    branchSha: '0000000000000000000000000000000000000000',
    firebaseDeploymentPass: true,
    vercelDeploymentPass: true,
    expectedSha: SHA
  }));
});

test('Production deployment fails environment guard', () => {
  expectCode('PRODUCTION_URL_FORBIDDEN', () => assertExactStagingMetadata({
    branchSha: SHA,
    firebaseDeploymentPass: true,
    vercelDeploymentPass: true,
    productionDeployment: true,
    expectedSha: SHA
  }));
});

test('accessible exact-SHA Staging deployment passes the complete contract', () => {
  assert.equal(assertExactStagingMetadata({
    branchSha: SHA,
    firebaseDeploymentPass: true,
    vercelDeploymentPass: true,
    productionDeployment: false,
    expectedSha: SHA
  }).code, 'PASS');
  assert.equal(inspectUiHttpPreflight({
    configuredUrl: STAGING_URL,
    finalUrl: `${STAGING_URL}/`,
    status: 200,
    body: ECOSCOLAIRE_HTML,
    expectedUrl: STAGING_URL
  }).code, 'PASS');
});
