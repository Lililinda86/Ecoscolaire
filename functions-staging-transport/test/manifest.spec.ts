import { describe, expect, it } from 'vitest';
import {
  assertManifestIntegrity,
  buildManifest,
  canonicalize,
  computeManifestDigest,
  computePrepareRequestDigest,
  deriveCrossSchoolId,
  deriveFixtureSchoolId,
  ManifestIntegrityError,
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
    const { manifestDigest, ...withoutDigest } = manifest;
    expect(manifestDigest).toBe(computeManifestDigest(withoutDigest));
    expect(() => assertManifestIntegrity(manifest)).not.toThrow();
  });

  it.each([
    ['fixtureSchoolId', (manifest: ReturnType<typeof buildManifest>) => ({ ...manifest, fixtureSchoolId: 'tampered-school' })],
    ['crossSchoolId', (manifest: ReturnType<typeof buildManifest>) => ({ ...manifest, crossSchoolId: 'tampered-cross-school' })],
    ['testRunId', (manifest: ReturnType<typeof buildManifest>) => ({ ...manifest, testRunId: '99999999-9' })],
    ['projectId', (manifest: ReturnType<typeof buildManifest>) => ({ ...manifest, projectId: 'ecoscolaire-c5861' })],
    ['allowedCollectionsVersion', (manifest: ReturnType<typeof buildManifest>) => ({
      ...manifest, allowedCollectionsVersion: 2 as unknown as 1,
    })],
    ['authUsers', (manifest: ReturnType<typeof buildManifest>) => ({
      ...manifest, authUsers: ['attacker@example.invalid'],
    })],
    ['expectedResourceIds', (manifest: ReturnType<typeof buildManifest>) => ({
      ...manifest, expectedResourceIds: [...manifest.expectedResourceIds, 'schools/extra'],
    })],
  ])('rejects %s tampering with MANIFEST_INTEGRITY_MISMATCH', (_field, mutate) => {
    const manifest = buildManifest(baseInput);
    expect(() => assertManifestIntegrity(mutate(manifest)))
      .toThrowError(ManifestIntegrityError);
    try {
      assertManifestIntegrity(mutate(manifest));
    } catch (error) {
      expect((error as ManifestIntegrityError).code).toBe('MANIFEST_INTEGRITY_MISMATCH');
    }
  });
});
