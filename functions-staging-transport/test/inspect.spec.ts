import { describe, expect, it } from 'vitest';
import { prepareFixtures } from '../src/prepare';
import { inspectFixtures, ManifestNotFoundError } from '../src/inspect';
import { STAGING_PROJECT_ID } from '../src/runtimeGuards';
import { ManifestIntegrityError } from '../src/manifest';
import {
  FakeAuthInspector, FakeClock, FakeFixtureBootstrapper, FakeManifestStore, FakeResourceInspector, FakeRunLock,
  FakeStagingBackend, RecordingLogger,
} from './fakes';

const TEST_RUN_ID = '33213214352-1';
const STAGING_CONTEXT = { projectId: STAGING_PROJECT_ID };

const setup = async () => {
  const backend = new FakeStagingBackend();
  const manifestStore = new FakeManifestStore();
  const prepareDeps = {
    manifestStore,
    runLock: new FakeRunLock(),
    fixtureBootstrapper: new FakeFixtureBootstrapper(backend),
    clock: new FakeClock(),
    logger: new RecordingLogger(),
    invokerServiceAccount: 'broker@ecoscolaire-staging.iam.gserviceaccount.com',
    authUserPlan: (testRunId: string) => [`secretary-${testRunId}@example.invalid`],
    expiresInMs: 60_000,
  };
  await prepareFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, prepareDeps);
  backend.seedAuthUser(`secretary-${TEST_RUN_ID}@example.invalid`);

  const inspectDeps = {
    manifestStore,
    resourceInspector: new FakeResourceInspector(backend),
    authInspector: new FakeAuthInspector(backend),
    clock: new FakeClock(),
  };
  return { backend, manifestStore, inspectDeps };
};

describe('inspect', () => {
  it('returns only ids/counts/state/ownership violations/auth status, no document bodies', async () => {
    const { inspectDeps } = await setup();
    const result = await inspectFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, inspectDeps);
    expect(Object.keys(result).sort()).toEqual(['authStatus', 'counts', 'ownershipViolations', 'state', 'testRunId']);
    expect(result.authStatus[`secretary-${TEST_RUN_ID}@example.invalid`]).toBe('present');
  });

  it('transitions PREPARED -> RUNNING on first inspect, stays RUNNING afterward', async () => {
    const { inspectDeps } = await setup();
    const first = await inspectFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, inspectDeps);
    expect(first.state).toBe('RUNNING');
    const second = await inspectFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, inspectDeps);
    expect(second.state).toBe('RUNNING');
  });

  it('detects ownership violations for resources not part of the manifest plan', async () => {
    const { backend, inspectDeps } = await setup();
    backend.seedOrphan('payments', 'unexpected-doc', `transport-release-staging-${TEST_RUN_ID}`, TEST_RUN_ID);
    const result = await inspectFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, inspectDeps);
    expect(result.ownershipViolations).toContain('payments/unexpected-doc');
  });

  it('reports missing Auth users distinctly from present ones', async () => {
    const { inspectDeps } = await setup();
    const result = await inspectFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, inspectDeps);
    expect(result.authStatus[`secretary-${TEST_RUN_ID}@example.invalid`]).toBe('present');
  });

  it('fails for an unknown testRunId', async () => {
    const { inspectDeps } = await setup();
    await expect(inspectFixtures({ schemaVersion: 1, testRunId: '99999999-1' }, STAGING_CONTEXT, inspectDeps))
      .rejects.toThrowError(ManifestNotFoundError);
  });

  it('fails closed before inspection when the stored manifest was tampered', async () => {
    const { manifestStore, inspectDeps } = await setup();
    await manifestStore.update(TEST_RUN_ID, (record) => ({
      ...record,
      manifest: { ...record.manifest, crossSchoolId: 'tampered-cross-school' },
    }));
    await expect(inspectFixtures({ schemaVersion: 1, testRunId: TEST_RUN_ID }, STAGING_CONTEXT, inspectDeps))
      .rejects.toThrowError(ManifestIntegrityError);
  });
});
