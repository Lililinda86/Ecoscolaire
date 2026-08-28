import { assertStagingRuntime, RuntimeProjectContext } from './runtimeGuards';
import { parseCleanupRequest } from './apiSchema';
import { appendDeletion, appendEvent, ManifestDeletionRecord } from './manifest';
import { transition, FixtureRunState } from './stateMachine';
import { Clock, ConcurrencyLockError, ManifestStore, RunLock } from './prepare';
import { ManifestNotFoundError } from './inspect';

/** Hard-coded allow-list. Cleanup can never target any collection outside this set. */
export const ALLOWED_CLEANUP_COLLECTIONS = Object.freeze([
  'payments',
  'receipts',
  'transportPaymentAllocations',
  'financialBenefits',
  'paymentDeadlines',
  'paymentMoratoriums',
  'cashClosures',
  'audit_logs',
] as const);

export type AllowedCleanupCollection = (typeof ALLOWED_CLEANUP_COLLECTIONS)[number];

/** Bounded drain: never more than this many delete batches per collection per cleanup call. */
const MAX_BATCH_ITERATIONS = 50;
const BATCH_SIZE = 200;

export class CleanupIdentityError extends Error {
  readonly code = 'CLEANUP_IDENTITY_MISMATCH';
  constructor(message: string) {
    super(message);
    this.name = 'CleanupIdentityError';
  }
}

export interface DeleteBatchRequest {
  readonly collection: AllowedCleanupCollection;
  readonly fixtureSchoolId: string;
  readonly testRunId: string;
  readonly limit: number;
}

export interface DeleteBatchResult {
  readonly deletedIds: readonly string[];
  readonly done: boolean;
}

/**
 * The only way to delete documents. Implementations MUST require, in addition to
 * the collection/fixtureSchoolId/testRunId filter, that testFixture === true on
 * every matched document. There is no recursive/unbounded delete primitive.
 */
export interface CollectionDeleter {
  deleteBatch(request: DeleteBatchRequest): Promise<DeleteBatchResult>;
}

export interface CounterCleaner {
  /** Only ever called with [`receipts_<fixtureSchoolId>`, `receipts_<crossSchoolId>`]. */
  resetCounters(counterIds: readonly string[]): Promise<void>;
}

export interface AuthCleaner {
  deleteFixtureUsers(authUsers: readonly string[]): Promise<{ deletedEmails: readonly string[] }>;
}

export interface CleanupDependencies {
  readonly manifestStore: ManifestStore;
  readonly runLock: RunLock;
  readonly collectionDeleter: CollectionDeleter;
  readonly counterCleaner: CounterCleaner;
  readonly authCleaner: AuthCleaner;
  readonly clock: Clock;
}

export interface CleanupResult {
  readonly testRunId: string;
  readonly state: FixtureRunState;
  readonly deletedByCollection: Readonly<Record<AllowedCleanupCollection, number>>;
  readonly deletedAuthEmails: readonly string[];
}

const drainCollection = async (
  deps: CleanupDependencies,
  manifestFixtureSchoolId: string,
  manifestTestRunId: string,
  collection: AllowedCleanupCollection,
): Promise<readonly string[]> => {
  const deleted: string[] = [];
  for (let iteration = 0; iteration < MAX_BATCH_ITERATIONS; iteration += 1) {
    const result = await deps.collectionDeleter.deleteBatch({
      collection,
      fixtureSchoolId: manifestFixtureSchoolId,
      testRunId: manifestTestRunId,
      limit: BATCH_SIZE,
    });
    deleted.push(...result.deletedIds);
    if (result.done) break;
  }
  return deleted;
};

export const cleanupFixtures = async (
  rawRequest: unknown,
  runtimeContext: RuntimeProjectContext,
  deps: CleanupDependencies,
): Promise<CleanupResult> => {
  assertStagingRuntime(runtimeContext);
  const request = parseCleanupRequest(rawRequest);

  if (!deps.runLock.acquire(request.testRunId)) {
    throw new ConcurrencyLockError(`Fixture run ${request.testRunId} is locked by a concurrent operation.`);
  }

  try {
    const existing = await deps.manifestStore.get(request.testRunId);
    if (!existing) throw new ManifestNotFoundError(request.testRunId);

    const { manifest } = existing;
    if (manifest.testFixture !== true || manifest.testRunId !== request.testRunId) {
      throw new CleanupIdentityError('Cleanup refused: manifest membership/testFixture identity check failed.');
    }

    const nextState = transition(existing.state, 'cleanup');
    const now = deps.clock.now().toISOString();

    const deletedByCollection: Record<AllowedCleanupCollection, number> = Object.fromEntries(
      ALLOWED_CLEANUP_COLLECTIONS.map((collection) => [collection, 0]),
    ) as Record<AllowedCleanupCollection, number>;
    const allDeletions: ManifestDeletionRecord[] = [];

    for (const collection of ALLOWED_CLEANUP_COLLECTIONS) {
      const deletedIds = await drainCollection(deps, manifest.fixtureSchoolId, manifest.testRunId, collection);
      deletedByCollection[collection] = deletedIds.length;
      for (const documentId of deletedIds) {
        allDeletions.push({ testRunId: request.testRunId, collection, documentId, deletedAt: now });
      }
    }

    // Counters restricted exactly to the fixture and cross school receipts counters — nothing else.
    await deps.counterCleaner.resetCounters([
      `receipts_${manifest.fixtureSchoolId}`,
      `receipts_${manifest.crossSchoolId}`,
    ]);

    const authResult = await deps.authCleaner.deleteFixtureUsers(manifest.authUsers);

    await deps.manifestStore.update(request.testRunId, (record) => ({
      ...record,
      state: nextState,
      events: appendEvent(record.events, { testRunId: request.testRunId, type: 'CLEANUP_PROGRESS', at: now }),
      deletions: allDeletions.reduce((acc, deletion) => appendDeletion(acc, deletion), record.deletions),
    }));

    return {
      testRunId: request.testRunId,
      state: nextState,
      deletedByCollection,
      deletedAuthEmails: authResult.deletedEmails,
    };
  } finally {
    deps.runLock.release(request.testRunId);
  }
};
