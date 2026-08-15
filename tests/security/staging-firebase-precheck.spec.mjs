import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertStagingFirebasePrecheck,
  classifyFirebaseRequest,
} from '../../scripts/staging-firebase-precheck.mjs';

const stagingRequest = 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?database=projects%2Fecoscolaire-staging%2Fdatabases%2F(default)';
const productionRequest = 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?database=projects%2Fecoscolaire-c5861%2Fdatabases%2F(default)';

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
