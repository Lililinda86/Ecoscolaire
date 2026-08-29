import { describe, expect, it } from 'vitest';
import { cleanupFixtures, CollectionDeleter, DeleteBatchRequest, DeleteBatchResult } from '../src/cleanup';
import { inspectFixtures } from '../src/inspect';
import { ConcurrencyLockError, prepareFixtures } from '../src/prepare';
import { STAGING_PROJECT_ID } from '../src/runtimeGuards';
import { verifyCleanup } from '../src/verifyCleanup';
import {
  FakeAuthCleaner,
  FakeAuthInspector,
  FakeClock,
  FakeCollectionDeleter,
  FakeCounterCleaner,
  FakeFixtureBootstrapper,
  FakeManifestStore,
  FakeResidualCounter,
  FakeResourceInspector,
  FakeRunLock,
  FakeStagingBackend,
  RecordingLogger,
} from './fakes';

const FIRST_RUN_ID = '33213214352-1';
const SECOND_RUN_ID = '33213214352-2';
const STAGING_CONTEXT = { projectId: STAGING_PROJECT_ID };

class BlockingCollectionDeleter implements CollectionDeleter {
  readonly started: Promise<void>;
  private markStarted!: () => void;
  private readonly unblock: Promise<void>;
  private releaseBlock!: () => void;
  private blocked = false;

  constructor(private readonly delegate: CollectionDeleter) {
    this.started = new Promise((resolve) => { this.markStarted = resolve; });
    this.unblock = new Promise((resolve) => { this.releaseBlock = resolve; });
  }

  release(): void {
    this.releaseBlock();
  }

  async deleteBatch(request: DeleteBatchRequest): Promise<DeleteBatchResult> {
    if (!this.blocked) {
      this.blocked = true;
      this.markStarted();
      await this.unblock;
    }
    return this.delegate.deleteBatch(request);
  }
}

const setup = async () => {
  const backend = new FakeStagingBackend();
  const manifestStore = new FakeManifestStore();
  const runLock = new FakeRunLock();
  const clock = new FakeClock();
  const prepareDeps = {
    manifestStore,
    runLock,
    fixtureBootstrapper: new FakeFixtureBootstrapper(backend),
    clock,
    logger: new RecordingLogger(),
    invokerServiceAccount: 'broker@ecoscolaire-staging.iam.gserviceaccount.com',
    authUserPlan: (testRunId: string) => [`secretary-${testRunId}@example.invalid`],
    expiresInMs: 60_000,
  };
  await prepareFixtures({ schemaVersion: 1, testRunId: FIRST_RUN_ID }, STAGING_CONTEXT, prepareDeps);
  await prepareFixtures({ schemaVersion: 1, testRunId: SECOND_RUN_ID }, STAGING_CONTEXT, prepareDeps);

  const inspectDeps = {
    manifestStore,
    runLock,
    resourceInspector: new FakeResourceInspector(backend),
    authInspector: new FakeAuthInspector(backend),
    clock,
  };
  const verifyDeps = {
    manifestStore,
    runLock,
    residualCounter: new FakeResidualCounter(backend),
    clock,
  };
  return { backend, manifestStore, runLock, clock, inspectDeps, verifyDeps };
};

describe('broker lifecycle concurrency', () => {
  it('serializes inspect and verifyCleanup behind cleanup for the same testRunId without lost updates', async () => {
    const { backend, manifestStore, runLock, clock, inspectDeps, verifyDeps } = await setup();
    const blockingDeleter = new BlockingCollectionDeleter(new FakeCollectionDeleter(backend));
    const cleanupPromise = cleanupFixtures(
      { schemaVersion: 1, testRunId: FIRST_RUN_ID },
      STAGING_CONTEXT,
      {
        manifestStore,
        runLock,
        collectionDeleter: blockingDeleter,
        counterCleaner: new FakeCounterCleaner(),
        authCleaner: new FakeAuthCleaner(backend),
        clock,
      },
    );

    await blockingDeleter.started;
    await expect(inspectFixtures(
      { schemaVersion: 1, testRunId: FIRST_RUN_ID },
      STAGING_CONTEXT,
      inspectDeps,
    )).rejects.toThrowError(ConcurrencyLockError);
    await expect(verifyCleanup(
      { schemaVersion: 1, testRunId: FIRST_RUN_ID },
      STAGING_CONTEXT,
      verifyDeps,
    )).rejects.toThrowError(ConcurrencyLockError);

    blockingDeleter.release();
    await cleanupPromise;

    const record = await manifestStore.get(FIRST_RUN_ID);
    expect(record?.state).toBe('CLEANING');
    expect(record?.events.filter((event) => event.type === 'CLEANUP_PROGRESS')).toHaveLength(1);
    expect(record?.events.some((event) => event.type === 'INSPECTED' || event.type === 'VERIFIED')).toBe(false);
  });

  it('keeps locks scoped by testRunId so a different isolated run can proceed', async () => {
    const { runLock, inspectDeps } = await setup();
    expect(runLock.acquire(FIRST_RUN_ID)).toBe(true);
    const result = await inspectFixtures(
      { schemaVersion: 1, testRunId: SECOND_RUN_ID },
      STAGING_CONTEXT,
      inspectDeps,
    );
    expect(result.state).toBe('RUNNING');
    runLock.release(FIRST_RUN_ID);
  });
});
