import { describe, expect, it } from 'vitest';
import { prepareFixtures } from '../src/prepare';
import { ALLOWED_CLEANUP_COLLECTIONS, cleanupFixtures } from '../src/cleanup';
import { REQUIRED_RESIDUAL_CATEGORIES, verifyCleanup } from '../src/verifyCleanup';
import { STAGING_PROJECT_ID } from '../src/runtimeGuards';
import {
  FakeAuthCleaner, FakeClock, FakeCollectionDeleter, FakeCounterCleaner, FakeFixtureBootstrapper,
  FakeManifestStore, FakeResidualCounter, FakeRunLock, FakeStagingBackend, RecordingLogger,
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
  const verifyDeps = { manifestStore, residualCounter: new FakeResidualCounter(backend), clock: new FakeClock() };
  return { backend, manifestStore, cleanupDeps, verifyDeps };
};

describe('verifyCleanup', () => {
  it('fails (denied) before cleanup has ever run: verify is only valid from CLEANING/VERIFIED', async () => {
    const { verifyDeps } = await setup();
    await expect(verifyCleanup({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, verifyDeps))
      .rejects.toThrow();
  });

  it('reports every required residual category once in CLEANING state', async () => {
    const { cleanupDeps, verifyDeps } = await setup();
    await cleanupFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, cleanupDeps);
    const result = await verifyCleanup({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, verifyDeps);
    expect(Object.keys(result.residuals).sort()).toEqual([...REQUIRED_RESIDUAL_CATEGORIES].sort());
    expect(result.passed).toBe(true);
  });

  it('fails and stays CLEANING while any residual category is non-zero', async () => {
    const { manifestStore, verifyDeps } = await setup();
    // Force CLEANING without running the real cleanup, so seeded fixture docs remain.
    await manifestStore.update(TEST_RUN_ID, (record) => ({ ...record, state: 'CLEANING' }));
    const result = await verifyCleanup({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, verifyDeps);
    expect(result.passed).toBe(false);
    expect(result.state).toBe('CLEANING');
    expect(result.failingCategories.length).toBeGreaterThan(0);
  });

  it('passes and transitions to VERIFIED once cleanup has zeroed every category', async () => {
    const { cleanupDeps, verifyDeps } = await setup();
    await cleanupFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, cleanupDeps);
    const result = await verifyCleanup({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, verifyDeps);
    expect(result.passed).toBe(true);
    expect(result.state).toBe('VERIFIED');
    expect(result.failingCategories).toEqual([]);
  });

  it('VERIFIED + verify is a no-op that stays VERIFIED', async () => {
    const { cleanupDeps, verifyDeps } = await setup();
    await cleanupFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, cleanupDeps);
    await verifyCleanup({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, verifyDeps);
    const second = await verifyCleanup({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, verifyDeps);
    expect(second.state).toBe('VERIFIED');
    expect(second.passed).toBe(true);
  });

  it('counts orphans as a distinct required category', async () => {
    const { backend, cleanupDeps, verifyDeps } = await setup();
    await cleanupFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, cleanupDeps);
    backend.seedOrphan('payments', 'leftover-orphan', FIXTURE_SCHOOL_ID, TEST_RUN_ID);
    const result = await verifyCleanup({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, verifyDeps);
    expect(result.passed).toBe(false);
    expect(result.failingCategories).toContain('orphans');
  });
});
