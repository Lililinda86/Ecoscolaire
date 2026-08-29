import {
  assertNoItaloReference,
  assertStagingRuntime,
  REAL_ITALO_SCHOOL_ID,
  RuntimeGuardError,
  RuntimeProjectContext,
  STAGING_PROJECT_ID,
} from './runtimeGuards';
import { parsePrepareRequest } from './apiSchema';
import {
  assertManifestIntegrity,
  buildManifest,
  computePrepareRequestDigest,
  deriveCrossSchoolId,
  deriveFixtureSchoolId,
  ManifestDeletionRecord,
  ManifestEvent,
  ManifestResourceRecord,
  planExpectedResourceIds,
  TransportReleaseManifest,
} from './manifest';
import { FixtureRunState } from './stateMachine';

export interface ManifestRecord {
  readonly manifest: TransportReleaseManifest;
  readonly state: FixtureRunState;
  readonly events: readonly ManifestEvent[];
  readonly resources: readonly ManifestResourceRecord[];
  readonly deletions: readonly ManifestDeletionRecord[];
}

export interface ManifestStore {
  get(testRunId: string): Promise<ManifestRecord | null>;
  create(record: ManifestRecord): Promise<void>;
  update(testRunId: string, updater: (record: ManifestRecord) => ManifestRecord): Promise<ManifestRecord>;
}

/** Serializes concurrent operations targeting the same testRunId; distinct testRunIds never contend. */
export interface RunLock {
  acquire(testRunId: string): boolean;
  release(testRunId: string): void;
}

export interface FixtureBootstrapper {
  /** Idempotent: `alreadyCreated` lets a retry resume after a partial failure. */
  createFixtureStructures(
    manifest: TransportReleaseManifest,
    alreadyCreated: readonly string[],
  ): Promise<{ createdResourceIds: readonly string[] }>;
}

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
}

export interface Clock {
  now(): Date;
}

export interface PrepareDependencies {
  readonly manifestStore: ManifestStore;
  readonly runLock: RunLock;
  readonly fixtureBootstrapper: FixtureBootstrapper;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly invokerServiceAccount: string;
  /** Server-derived plan of Auth fixture emails (never passwords) for this run. */
  readonly authUserPlan: (testRunId: string) => readonly string[];
  readonly expiresInMs: number;
}

export class PrepareConflictError extends Error {
  readonly code = 'PREPARE_CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'PrepareConflictError';
  }
}

export class ConcurrencyLockError extends Error {
  readonly code = 'RUN_LOCKED';
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyLockError';
  }
}

export interface PrepareResult {
  readonly manifest: TransportReleaseManifest;
  readonly state: FixtureRunState;
  readonly replay: boolean;
}

export const prepareFixtures = async (
  rawRequest: unknown,
  runtimeContext: RuntimeProjectContext,
  deps: PrepareDependencies,
): Promise<PrepareResult> => {
  assertStagingRuntime(runtimeContext);
  assertNoItaloReference(rawRequest);
  const request = parsePrepareRequest(rawRequest);
  const prepareRequestDigest = computePrepareRequestDigest(request);

  if (!deps.runLock.acquire(request.testRunId)) {
    throw new ConcurrencyLockError(`Fixture run ${request.testRunId} is locked by a concurrent operation.`);
  }

  try {
    const existing = await deps.manifestStore.get(request.testRunId);

    if (existing) {
      assertManifestIntegrity(existing.manifest);
      if (existing.manifest.prepareRequestDigest !== prepareRequestDigest) {
        throw new PrepareConflictError(`testRunId ${request.testRunId} was already prepared with a different request.`);
      }

      // Idempotent replay: resume bootstrap only for resources not yet created.
      if (existing.resources.length < existing.manifest.expectedResourceIds.length) {
        const alreadyCreated = existing.resources.map((resource) => resource.documentId);
        const bootstrap = await deps.fixtureBootstrapper.createFixtureStructures(existing.manifest, alreadyCreated);
        const updated = await appendCreatedResources(deps, request.testRunId, bootstrap.createdResourceIds);
        deps.logger.info('prepare.replay.resumed', { testRunId: request.testRunId });
        return { manifest: updated.manifest, state: updated.state, replay: true };
      }

      deps.logger.info('prepare.replay', { testRunId: request.testRunId });
      return { manifest: existing.manifest, state: existing.state, replay: true };
    }

    const fixtureSchoolId = deriveFixtureSchoolId(request.testRunId);
    const crossSchoolId = deriveCrossSchoolId(request.testRunId);
    if (fixtureSchoolId === REAL_ITALO_SCHOOL_ID || crossSchoolId === REAL_ITALO_SCHOOL_ID) {
      throw new RuntimeGuardError('REAL_ITALO_SCHOOL_REFERENCED', 'Refusing to derive the real ITALO school id.');
    }

    const now = deps.clock.now();
    const manifest = buildManifest({
      testRunId: request.testRunId,
      projectId: runtimeContext.projectId ?? STAGING_PROJECT_ID,
      databaseId: '(default)',
      prepareRequestDigest,
      authUsers: deps.authUserPlan(request.testRunId),
      expectedResourceIds: planExpectedResourceIds(fixtureSchoolId, crossSchoolId),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + deps.expiresInMs).toISOString(),
      invokerServiceAccount: deps.invokerServiceAccount,
    });

    // Persisted before any side effect so a partial failure is always resumable/inspectable.
    await deps.manifestStore.create({
      manifest,
      state: 'PREPARED',
      events: [{ testRunId: request.testRunId, type: 'PREPARED', at: now.toISOString() }],
      resources: [],
      deletions: [],
    });

    const bootstrap = await deps.fixtureBootstrapper.createFixtureStructures(manifest, []);
    const updated = await appendCreatedResources(deps, request.testRunId, bootstrap.createdResourceIds);
    deps.logger.info('prepare.created', { testRunId: request.testRunId });
    return { manifest: updated.manifest, state: updated.state, replay: false };
  } finally {
    deps.runLock.release(request.testRunId);
  }
};

const appendCreatedResources = async (
  deps: PrepareDependencies,
  testRunId: string,
  createdResourceIds: readonly string[],
): Promise<ManifestRecord> => deps.manifestStore.update(testRunId, (record) => {
  assertManifestIntegrity(record.manifest);
  const now = deps.clock.now().toISOString();
  const newResources = createdResourceIds
    .filter((id) => !record.resources.some((resource) => resource.documentId === id))
    .map((id) => ({ testRunId, collection: id.split('/')[0] ?? 'schools', documentId: id, createdAt: now }));
  return { ...record, resources: [...record.resources, ...newResources] };
});
