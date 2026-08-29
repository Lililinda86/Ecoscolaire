import { createHash } from 'node:crypto';

/**
 * Control-plane manifest for one isolated Transport fixture release run.
 * All identity fields are immutable once written; only append-only
 * events/resources/deletions accumulate afterward.
 */

export const ALLOWED_COLLECTIONS_VERSION = 1 as const;

export const deriveFixtureSchoolId = (testRunId: string): string => `transport-release-staging-${testRunId}`;
export const deriveCrossSchoolId = (testRunId: string): string => `transport-release-staging-${testRunId}-cross`;

/** Deterministic, server-derived plan of the structural resources the broker will create. */
export const planExpectedResourceIds = (fixtureSchoolId: string, crossSchoolId: string): readonly string[] => [
  `schools/${fixtureSchoolId}`,
  `schools/${crossSchoolId}`,
];

export interface TransportReleaseManifest {
  readonly schemaVersion: 1;
  readonly testFixture: true;
  readonly testRunId: string;
  readonly projectId: string;
  readonly databaseId: string;
  readonly fixtureSchoolId: string;
  readonly crossSchoolId: string;
  readonly manifestDigest: string;
  readonly prepareRequestDigest: string;
  readonly allowedCollectionsVersion: typeof ALLOWED_COLLECTIONS_VERSION;
  readonly authUsers: readonly string[];
  readonly expectedResourceIds: readonly string[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly invokerServiceAccount: string;
}

export type ManifestEventType = 'PREPARED' | 'INSPECTED' | 'CLEANUP_STARTED' | 'CLEANUP_PROGRESS' | 'VERIFIED';

export interface ManifestEvent {
  readonly testRunId: string;
  readonly type: ManifestEventType;
  readonly at: string;
}

export interface ManifestResourceRecord {
  readonly testRunId: string;
  readonly collection: string;
  readonly documentId: string;
  readonly createdAt: string;
}

export interface ManifestDeletionRecord {
  readonly testRunId: string;
  readonly collection: string;
  readonly documentId: string;
  readonly deletedAt: string;
}

/** Deterministic canonical JSON: object keys sorted recursively, arrays left in order. */
export const canonicalize = (value: unknown): string => {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (typeof input === 'object' && input !== null) {
      const entries = Object.entries(input as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, val]) => [key, sort(val)] as const);
      return Object.fromEntries(entries);
    }
    return input;
  };
  return JSON.stringify(sort(value));
};

export const sha256Hex = (input: string): string => createHash('sha256').update(input, 'utf8').digest('hex');

export const computePrepareRequestDigest = (request: { schemaVersion: number; testRunId: string }): string =>
  sha256Hex(canonicalize(request));

/** The manifest digest covers every immutable identity field except itself. */
export const computeManifestDigest = (manifest: Omit<TransportReleaseManifest, 'manifestDigest'>): string =>
  sha256Hex(canonicalize(manifest));

/**
 * Central fail-closed integrity check for manifests read from the store.
 * Lifecycle state/events/resources/deletions intentionally live outside the
 * immutable manifest and therefore never participate in this digest.
 */
export class ManifestIntegrityError extends Error {
  readonly code = 'MANIFEST_INTEGRITY_MISMATCH';

  constructor() {
    super('Stored Transport fixture manifest does not match its immutable digest.');
    this.name = 'ManifestIntegrityError';
  }
}

export const immutableManifestFields = (
  manifest: TransportReleaseManifest,
): Omit<TransportReleaseManifest, 'manifestDigest'> => {
  const { manifestDigest: _storedDigest, ...immutable } = manifest;
  void _storedDigest;
  return immutable;
};

export const assertManifestIntegrity = (manifest: TransportReleaseManifest): void => {
  const expectedDigest = computeManifestDigest(immutableManifestFields(manifest));
  if (manifest.manifestDigest !== expectedDigest) {
    throw new ManifestIntegrityError();
  }
};

export class RunExpiredError extends Error {
  readonly code = 'RUN_EXPIRED';

  constructor(testRunId: string) {
    super(`Transport fixture run ${testRunId} has expired.`);
    this.name = 'RunExpiredError';
  }
}

/** Fail closed for lifecycle operations that are unsafe after the immutable expiry. */
export const assertRunNotExpired = (manifest: TransportReleaseManifest, now: Date): void => {
  const expiresAt = Date.parse(manifest.expiresAt);
  if (!Number.isFinite(expiresAt) || now.getTime() >= expiresAt) {
    throw new RunExpiredError(manifest.testRunId);
  }
};

export interface BuildManifestInput {
  readonly testRunId: string;
  readonly projectId: string;
  readonly databaseId: string;
  readonly prepareRequestDigest: string;
  readonly authUsers: readonly string[];
  readonly expectedResourceIds: readonly string[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly invokerServiceAccount: string;
}

export const buildManifest = (input: BuildManifestInput): TransportReleaseManifest => {
  const withoutDigest: Omit<TransportReleaseManifest, 'manifestDigest'> = {
    schemaVersion: 1,
    testFixture: true,
    testRunId: input.testRunId,
    projectId: input.projectId,
    databaseId: input.databaseId,
    fixtureSchoolId: deriveFixtureSchoolId(input.testRunId),
    crossSchoolId: deriveCrossSchoolId(input.testRunId),
    prepareRequestDigest: input.prepareRequestDigest,
    allowedCollectionsVersion: ALLOWED_COLLECTIONS_VERSION,
    authUsers: input.authUsers,
    expectedResourceIds: input.expectedResourceIds,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    invokerServiceAccount: input.invokerServiceAccount,
  };
  return { ...withoutDigest, manifestDigest: computeManifestDigest(withoutDigest) };
};

export const appendEvent = (
  events: readonly ManifestEvent[],
  event: ManifestEvent,
): readonly ManifestEvent[] => [...events, event];

export const appendResource = (
  resources: readonly ManifestResourceRecord[],
  resource: ManifestResourceRecord,
): readonly ManifestResourceRecord[] => [...resources, resource];

export const appendDeletion = (
  deletions: readonly ManifestDeletionRecord[],
  deletion: ManifestDeletionRecord,
): readonly ManifestDeletionRecord[] => [...deletions, deletion];
