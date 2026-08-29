import { assertStagingRuntime, RuntimeProjectContext } from './runtimeGuards';
import { parseVerifyCleanupRequest } from './apiSchema';
import { appendEvent, assertManifestIntegrity } from './manifest';
import { transition, FixtureRunState } from './stateMachine';
import { Clock, ManifestStore } from './prepare';
import { ManifestNotFoundError } from './inspect';
import { ALLOWED_CLEANUP_COLLECTIONS, AllowedCleanupCollection } from './cleanup';

/** Every category that must be exactly zero before a run can be marked VERIFIED. */
export const REQUIRED_RESIDUAL_CATEGORIES = Object.freeze([
  ...ALLOWED_CLEANUP_COLLECTIONS,
  'authUsers',
  'orphans',
] as const);

export type ResidualCategory = (typeof REQUIRED_RESIDUAL_CATEGORIES)[number];

export interface ResidualCounter {
  countResidualsByCollection(
    fixtureSchoolId: string,
    testRunId: string,
  ): Promise<Readonly<Record<AllowedCleanupCollection, number>>>;
  countResidualAuthUsers(authUsers: readonly string[]): Promise<number>;
  /** Any fixture-tagged document/user found outside the manifest's own identity (leaked across runs). */
  countOrphans(fixtureSchoolId: string, crossSchoolId: string, testRunId: string): Promise<number>;
}

export interface VerifyCleanupDependencies {
  readonly manifestStore: ManifestStore;
  readonly residualCounter: ResidualCounter;
  readonly clock: Clock;
}

export interface VerifyCleanupResult {
  readonly testRunId: string;
  readonly state: FixtureRunState;
  readonly passed: boolean;
  readonly residuals: Readonly<Record<ResidualCategory, number>>;
  readonly failingCategories: readonly ResidualCategory[];
}

export const verifyCleanup = async (
  rawRequest: unknown,
  runtimeContext: RuntimeProjectContext,
  deps: VerifyCleanupDependencies,
): Promise<VerifyCleanupResult> => {
  assertStagingRuntime(runtimeContext);
  const request = parseVerifyCleanupRequest(rawRequest);

  const existing = await deps.manifestStore.get(request.testRunId);
  if (!existing) throw new ManifestNotFoundError(request.testRunId);
  assertManifestIntegrity(existing.manifest);
  const { manifest } = existing;

  const [byCollection, authResiduals, orphans] = await Promise.all([
    deps.residualCounter.countResidualsByCollection(manifest.fixtureSchoolId, manifest.testRunId),
    deps.residualCounter.countResidualAuthUsers(manifest.authUsers),
    deps.residualCounter.countOrphans(manifest.fixtureSchoolId, manifest.crossSchoolId, manifest.testRunId),
  ]);

  const residuals: Record<ResidualCategory, number> = {
    ...byCollection,
    authUsers: authResiduals,
    orphans,
  } as Record<ResidualCategory, number>;

  const failingCategories = REQUIRED_RESIDUAL_CATEGORIES.filter((category) => residuals[category] !== 0);
  const passed = failingCategories.length === 0;

  const nextState = transition(existing.state, 'verify', { allResidualsZero: passed });

  if (nextState === 'VERIFIED' && existing.state !== 'VERIFIED') {
    await deps.manifestStore.update(request.testRunId, (record) => {
      assertManifestIntegrity(record.manifest);
      return {
        ...record,
        state: nextState,
        events: appendEvent(record.events, { testRunId: request.testRunId, type: 'VERIFIED', at: deps.clock.now().toISOString() }),
      };
    });
  }

  return { testRunId: request.testRunId, state: nextState, passed, residuals, failingCategories };
};
