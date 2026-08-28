import { describe, expect, it } from 'vitest';
import {
  buildManifest,
  canonicalize,
  computeManifestDigest,
  computePrepareRequestDigest,
  deriveCrossSchoolId,
  deriveFixtureSchoolId,
  planExpectedResourceIds,
} from '../src/manifest';

const baseInput = {
  testRunId: '33213214352-1',
  projectId: 'ecoscolaire-staging',
  databaseId: '(default)',
  prepareRequestDigest: computePrepareRequestDigest({ schemaVersion: 1, testRunId: '33213214352-1' }),
  authUsers: ['secretary-33213214352-1@example.invalid'],
  expectedResourceIds: planExpectedResourceIds(deriveFixtureSchoolId('33213214352-1'), deriveCrossSchoolId('33213214352-1')),
  createdAt: '2026-08-28T21:00:00.000Z',
  expiresAt: '2026-08-28T23:00:00.000Z',
  invokerServiceAccount: 'broker@ecoscolaire-staging.iam.gserviceaccount.com',
};

describe('manifest', () => {
  it('derives fixtureSchoolId and crossSchoolId deterministically from testRunId', () => {
    expect(deriveFixtureSchoolId('33213214352-1')).toBe('transport-release-staging-33213214352-1');
    expect(deriveCrossSchoolId('33213214352-1')).toBe('transport-release-staging-33213214352-1-cross');
  });

  it('canonicalize sorts object keys recursively so key order never affects digests', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalize({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('computePrepareRequestDigest is deterministic for the same request', () => {
    const a = computePrepareRequestDigest({ schemaVersion: 1, testRunId: '33213214352-1' });
    const b = computePrepareRequestDigest({ schemaVersion: 1, testRunId: '33213214352-1' });
    expect(a).toBe(b);
  });

  it('computePrepareRequestDigest differs for a different testRunId', () => {
    const a = computePrepareRequestDigest({ schemaVersion: 1, testRunId: '33213214352-1' });
    const b = computePrepareRequestDigest({ schemaVersion: 1, testRunId: '33213214352-2' });
    expect(a).not.toBe(b);
  });

  it('buildManifest produces an internally consistent, immutable-identity manifest', () => {
    const manifest = buildManifest(baseInput);
    expect(manifest.testFixture).toBe(true);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.fixtureSchoolId).toBe('transport-release-staging-33213214352-1');
    expect(manifest.crossSchoolId).toBe('transport-release-staging-33213214352-1-cross');
    expect(manifest.manifestDigest).toBe(computeManifestDigest({ ...manifest, manifestDigest: undefined } as never));
  });

  it('manifest tampering is detected: any field change changes the digest', () => {
    const manifest = buildManifest(baseInput);
    const { manifestDigest, ...withoutDigest } = manifest;
    const tampered = { ...withoutDigest, expectedResourceIds: [...withoutDigest.expectedResourceIds, 'schools/extra'] };
    expect(computeManifestDigest(tampered)).not.toBe(manifestDigest);
  });
});
