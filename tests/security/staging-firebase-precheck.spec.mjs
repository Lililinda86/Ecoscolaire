import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAutomationBypassSecret,
  assertProtectedPreviewLoaded,
  assertStagingFirebasePrecheck,
  assertStagingRuntimeProject,
  classifyFirebaseRequest,
} from '../../scripts/staging-firebase-precheck.mjs';

const stagingRequest = 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?database=projects%2Fecoscolaire-staging%2Fdatabases%2F(default)';
const productionRequest = 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?database=projects%2Fecoscolaire-c5861%2Fdatabases%2F(default)';

test('missing automation bypass secret fails before Playwright', () => {
  for (const value of [undefined, '', '   ']) {
    assert.throws(() => assertAutomationBypassSecret(value), /BYPASS_SECRET is missing/);
  }
  assert.equal(assertAutomationBypassSecret('synthetic-bypass'), 'synthetic-bypass');
});

test('protected Preview must stay on the expected app origin', () => {
  assert.equal(assertProtectedPreviewLoaded({
    expectedOrigin: 'https://ecoscolaire-preview.vercel.app',
    actualUrl: 'https://ecoscolaire-preview.vercel.app/#/diagnostic',
  }), 'https://ecoscolaire-preview.vercel.app');
});

test('Vercel login returned instead of the app fails closed', () => {
  assert.throws(
    () => assertProtectedPreviewLoaded({
      expectedOrigin: 'https://ecoscolaire-preview.vercel.app',
      actualUrl: 'https://vercel.com/login?next=protected-preview',
    }),
    /Vercel login page was returned/,
  );
});

test('navigation to any unexpected origin fails closed', () => {
  assert.throws(
    () => assertProtectedPreviewLoaded({
      expectedOrigin: 'https://ecoscolaire-preview.vercel.app',
      actualUrl: 'https://example.com/#/diagnostic',
    }),
    /left the expected protected Preview origin/,
  );
});

test('A: staging runtime plus staging request passes', () => {
  assert.deepEqual(
    assertStagingFirebasePrecheck({
      runtimeProject: 'ecoscolaire-staging',
      requestUrls: [stagingRequest],
    }),
    { runtimeProject: 'ecoscolaire-staging', stagingRequests: 1, productionRequests: 0 },
  );
});

test('B: Production runtime fails closed before fixture creation', () => {
  assert.throws(
    () => assertStagingRuntimeProject('ecoscolaire-c5861'),
    /runtime Firebase project is Production/,
  );
  assert.throws(
    () => assertStagingFirebasePrecheck({
      runtimeProject: 'ecoscolaire-c5861',
      requestUrls: [productionRequest],
    }),
    /runtime Firebase project is Production/,
  );
});

test('C: absent or unknown runtime fails closed', () => {
  for (const runtimeProject of [undefined, '', 'unknown-project']) {
    assert.throws(
      () => assertStagingRuntimeProject(runtimeProject),
      /absent or unknown/,
    );
    assert.throws(
      () => assertStagingFirebasePrecheck({ runtimeProject, requestUrls: [stagingRequest] }),
      /absent or unknown/,
    );
  }
});

test('D: staging runtime with any Production Firebase request fails closed', () => {
  assert.throws(
    () => assertStagingFirebasePrecheck({
      runtimeProject: 'ecoscolaire-staging',
      requestUrls: [stagingRequest, productionRequest],
    }),
    /Production Firebase request was observed/,
  );
});

test('staging runtime without a staging-targeted interaction fails closed', () => {
  assert.throws(
    () => assertStagingFirebasePrecheck({
      runtimeProject: 'ecoscolaire-staging',
      requestUrls: ['https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword'],
    }),
    /no Firebase interaction targeting staging/,
  );
});

test('request classification handles URL-encoded Firebase project paths', () => {
  assert.deepEqual(classifyFirebaseRequest(stagingRequest), {
    relevant: true, staging: true, production: false,
  });
  assert.deepEqual(classifyFirebaseRequest(productionRequest), {
    relevant: true, staging: false, production: true,
  });
});
