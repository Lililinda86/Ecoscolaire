import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blockedFingerprints,
  fingerprintCredential,
  inspectSource,
  revokedCredentialFingerprints,
  secretGuardExitCode,
} from '../../scripts/check-staging-credential-regressions.mjs';

const EXPECTED_REVOKED_BETA_FINGERPRINT =
  '6dedea92f5d209549ef6664bbf7bb4554819ff6d9c41c7daac0fc7db4bf5aa96';

test('all revoked staging credential groups have blocked fingerprints', () => {
  assert.equal(revokedCredentialFingerprints.beta, EXPECTED_REVOKED_BETA_FINGERPRINT);
  assert.ok(blockedFingerprints.has(revokedCredentialFingerprints.alpha));
  assert.ok(blockedFingerprints.has(revokedCredentialFingerprints.beta));
  assert.ok(blockedFingerprints.has(revokedCredentialFingerprints.superAdmin));
});

test('a synthetic prohibited credential produces failure behavior', () => {
  const syntheticCredential = 'TEST-ONLY-REVOKED-CREDENTIAL-NOT-A-REAL-SECRET';
  const syntheticFingerprints = new Set([fingerprintCredential(syntheticCredential)]);
  const findings = inspectSource(
    'synthetic-secret-fixture.txt',
    `credential = ${JSON.stringify(syntheticCredential)}`,
    syntheticFingerprints,
  );

  assert.deepEqual(findings, ['synthetic-secret-fixture.txt: revoked credential literal']);
  assert.equal(secretGuardExitCode(findings), 1);
});
