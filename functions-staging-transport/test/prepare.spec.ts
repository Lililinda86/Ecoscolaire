import { describe, expect, it } from 'vitest';
import { prepareFixtures, PrepareConflictError, ConcurrencyLockError } from '../src/prepare';
import { RuntimeGuardError, STAGING_PROJECT_ID, PRODUCTION_PROJECT_ID } from '../src/runtimeGuards';
import { SchemaValidationError } from '../src/apiSchema';
import { deriveCrossSchoolId, deriveFixtureSchoolId } from '../src/manifest';
import {
  FakeClock, FakeFixtureBootstrapper, FakeManifestStore, FakeRunLock, FakeStagingBackend, RecordingLogger,
} from './fakes';

const TEST_RUN_ID = '33213214352-1';
const STAGING_CONTEXT = { projectId: STAGING_PROJECT_ID };

const makeDeps = (backend: FakeStagingBackend) => {
  const manifestStore = new FakeManifestStore();
  const logger = new RecordingLogger();
  return {
    manifestStore,
    runLock: new FakeRunLock(),
    fixtureBootstrapper: new FakeFixtureBootstrapper(backend),
    clock: new FakeClock(),
    logger,
    invokerServiceAccount: 'broker@ecoscolaire-staging.iam.gserviceaccount.com',
    authUserPlan: (testRunId: string) => [`secretary-${testRunId}@example.invalid`, `owner-${testRunId}@example.invalid`],
    expiresInMs: 2 * 60 * 60 * 1000,
  };
};

describe('prepare', () => {
  it('derives all IDs server-side and never trusts caller-supplied identifiers', async () => {
    const deps = makeDeps(new FakeStagingBackend());
    const result = await prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, deps);
    expect(result.manifest.fixtureSchoolId).toBe(deriveFixtureSchoolId(TEST_RUN_ID));
    expect(result.manifest.crossSchoolId).toBe(deriveCrossSchoolId(TEST_RUN_ID));
    expect(result.state).toBe('PREPARED');
    expect(result.replay).toBe(false);
  });

  it('rejects when the runtime project is not exactly ecoscolaire-staging', async () => {
    const deps = makeDeps(new FakeStagingBackend());
    await expect(prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, { projectId: 'other-project' }, deps))
      .rejects.toThrowError(RuntimeGuardError);
  });

  it('rejects the Production project explicitly', async () => {
    const deps = makeDeps(new FakeStagingBackend());
    await expect(prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, { projectId: PRODUCTION_PROJECT_ID }, deps))
      .rejects.toThrowError(RuntimeGuardError);
  });

  it('rejects a request referencing the real ITALO school anywhere', async () => {
    const deps = makeDeps(new FakeStagingBackend());
    await expect(prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID, note: 'italo-gsb' }, STAGING_CONTEXT, deps))
      .rejects.toThrow();
  });

  it('rejects malformed requests via schema validation', async () => {
    const deps = makeDeps(new FakeStagingBackend());
    await expect(prepareFixtures({ schemaVersion: 1, testRunId: 'not-valid' }, STAGING_CONTEXT, deps))
      .rejects.toThrowError(SchemaValidationError);
  });

  it('double prepare with an identical request is an idempotent replay', async () => {
    const deps = makeDeps(new FakeStagingBackend());
    const first = await prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, deps);
    const second = await prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, deps);
    expect(second.replay).toBe(true);
    expect(second.manifest.manifestDigest).toBe(first.manifest.manifestDigest);
  });

  it('divergent replay (same testRunId, would-be different manifest) is a collision, not a replay', async () => {
    const deps = makeDeps(new FakeStagingBackend());
    await prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, deps);
    // Same testRunId always parses to the same request shape (only schemaVersion+testRunId), so we
    // simulate a divergent prior request by tampering the stored digest directly.
    await deps.manifestStore.update(TEST_RUN_ID, (record) => ({
      ...record,
      manifest: { ...record.manifest, prepareRequestDigest: 'tampered-digest' },
    }));
    await expect(prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, deps))
      .rejects.toThrowError(PrepareConflictError);
  });

  it('collision detection: a second distinct testRunId never collides with an existing one', async () => {
    const deps = makeDeps(new FakeStagingBackend());
    const first = await prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, deps);
    const second = await prepareFixtures({ schemaVersion: 1, testRunId: '33213214352-2' }, STAGING_CONTEXT, deps);
    expect(second.manifest.fixtureSchoolId).not.toBe(first.manifest.fixtureSchoolId);
  });

  it('maintains recovery information and resumes after a partial bootstrap failure', async () => {
    const backend = new FakeStagingBackend();
    const deps = makeDeps(backend);
    (deps.fixtureBootstrapper as FakeFixtureBootstrapper).failNextCreationsCount = 1;

    await expect(prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, deps)).rejects.toThrow();

    const partial = await deps.manifestStore.get(TEST_RUN_ID);
    expect(partial).not.toBeNull();
    expect(partial!.state).toBe('PREPARED');
    expect(partial!.resources.length).toBe(0);

    const resumed = await prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, deps);
    expect(resumed.replay).toBe(true);
    expect(resumed.manifest.expectedResourceIds.length).toBeGreaterThan(0);
  });

  it('never logs actor passwords', async () => {
    const deps = makeDeps(new FakeStagingBackend());
    await prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, deps);
    const serializedLogs = JSON.stringify((deps.logger as RecordingLogger).entries).toLowerCase();
    expect(serializedLogs).not.toContain('password');
  });

  it('same-run concurrency is locked: a second concurrent prepare for the same testRunId is denied', async () => {
    const deps = makeDeps(new FakeStagingBackend());
    expect(deps.runLock.acquire(TEST_RUN_ID)).toBe(true);
    await expect(prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, deps))
      .rejects.toThrowError(ConcurrencyLockError);
    deps.runLock.release(TEST_RUN_ID);
  });

  it('different-run concurrency never contends', async () => {
    const deps = makeDeps(new FakeStagingBackend());
    expect(deps.runLock.acquire(TEST_RUN_ID)).toBe(true);
    await expect(prepareFixtures({ schemaVersion: 1, testRunId: '33213214352-2' }, STAGING_CONTEXT, deps))
      .resolves.toBeDefined();
    deps.runLock.release(TEST_RUN_ID);
  });
});
