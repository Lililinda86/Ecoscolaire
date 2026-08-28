import { describe, expect, it } from 'vitest';
import { prepareFixtures } from '../src/prepare';
import { ALLOWED_CLEANUP_COLLECTIONS, cleanupFixtures, CleanupIdentityError } from '../src/cleanup';
import { ConcurrencyLockError } from '../src/prepare';
import { STAGING_PROJECT_ID } from '../src/runtimeGuards';
import {
  FakeAuthCleaner, FakeClock, FakeCollectionDeleter, FakeCounterCleaner, FakeFixtureBootstrapper,
  FakeManifestStore, FakeRunLock, FakeStagingBackend, RecordingLogger,
} from './fakes';

const TEST_RUN_ID = '33213214352-1';
const STAGING_CONTEXT = { projectId: STAGING_PROJECT_ID };
const FIXTURE_SCHOOL_ID = `transport-release-staging-${TEST_RUN_ID}`;

const setup = async () => {
  const backend = new FakeStagingBackend();
  const manifestStore = new FakeManifestStore();
  const runLock = new FakeRunLock();
  const prepareDeps = {
    manifestStore,
    runLock,
    fixtureBootstrapper: new FakeFixtureBootstrapper(backend),
    clock: new FakeClock(),
    logger: new RecordingLogger(),
    invokerServiceAccount: 'broker@ecoscolaire-staging.iam.gserviceaccount.com',
    authUserPlan: (testRunId: string) => [`secretary-${testRunId}@example.invalid`],
    expiresInMs: 60_000,
  };
  await prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, prepareDeps);
  backend.seedAuthUser(`secretary-${TEST_RUN_ID}@example.invalid`);
  for (const collection of ALLOWED_CLEANUP_COLLECTIONS) {
    backend.seedDocument(collection, `${collection}-doc-1`, FIXTURE_SCHOOL_ID, TEST_RUN_ID);
  }

  const cleanupDeps = {
    manifestStore,
    runLock,
    collectionDeleter: new FakeCollectionDeleter(backend),
    counterCleaner: new FakeCounterCleaner(),
    authCleaner: new FakeAuthCleaner(backend),
    clock: new FakeClock(),
  };
  return { backend, manifestStore, runLock, cleanupDeps };
};

describe('cleanup', () => {
  it('deletes only allow-listed collections scoped to the exact fixture identity', async () => {
    const { backend, cleanupDeps } = await setup();
    const result = await cleanupFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, cleanupDeps);
    for (const collection of ALLOWED_CLEANUP_COLLECTIONS) {
      expect(result.deletedByCollection[collection]).toBe(1);
      expect(backend.documents.get(collection)!.size).toBe(0);
    }
    expect(result.state).toBe('CLEANING');
  });

  it('restricts counter resets to exactly receipts_<fixtureSchoolId> and receipts_<crossSchoolId>', async () => {
    const { cleanupDeps } = await setup();
    await cleanupFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, cleanupDeps);
    const counterCleaner = cleanupDeps.counterCleaner as FakeCounterCleaner;
    expect(counterCleaner.resetCalls).toHaveLength(1);
    expect(counterCleaner.resetCalls[0]).toEqual([
      `receipts_${FIXTURE_SCHOOL_ID}`,
      `receipts_${FIXTURE_SCHOOL_ID}-cross`,
    ]);
  });

  it('deletes only the fixture Auth users listed in the manifest', async () => {
    const { backend, cleanupDeps } = await setup();
    const result = await cleanupFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, cleanupDeps);
    expect(result.deletedAuthEmails).toEqual([`secretary-${TEST_RUN_ID}@example.invalid`]);
    expect(backend.authUsers.size).toBe(0);
  });

  it('is idempotent: a second cleanup call deletes nothing further and does not error', async () => {
    const { cleanupDeps } = await setup();
    await cleanupFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, cleanupDeps);
    const second = await cleanupFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, cleanupDeps);
    for (const collection of ALLOWED_CLEANUP_COLLECTIONS) expect(second.deletedByCollection[collection]).toBe(0);
    expect(second.state).toBe('CLEANING');
  });

  it('refuses to delete unless manifest membership, fixtureSchoolId and testFixture all match', async () => {
    const { manifestStore, cleanupDeps } = await setup();
    await manifestStore.update(TEST_RUN_ID, (record) => ({
      ...record,
      manifest: { ...record.manifest, testFixture: false as unknown as true },
    }));
    await expect(cleanupFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, cleanupDeps))
      .rejects.toThrowError(CleanupIdentityError);
  });

  it('same-run concurrency is locked', async () => {
    const { runLock, cleanupDeps } = await setup();
    expect(runLock.acquire(TEST_RUN_ID)).toBe(true);
    await expect(cleanupFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, cleanupDeps))
      .rejects.toThrowError(ConcurrencyLockError);
    runLock.release(TEST_RUN_ID);
  });
});
