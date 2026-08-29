import { assertStagingRuntime, RuntimeProjectContext } from './runtimeGuards';
import { parseInspectRequest } from './apiSchema';
import { appendEvent, assertManifestIntegrity } from './manifest';
import { transition, FixtureRunState } from './stateMachine';
import { Clock, ConcurrencyLockError, ManifestStore, RunLock } from './prepare';

export class ManifestNotFoundError extends Error {
  readonly code = 'MANIFEST_NOT_FOUND';
  constructor(testRunId: string) {
    super(`No fixture manifest found for testRunId ${testRunId}.`);
    this.name = 'ManifestNotFoundError';
  }
}

export type AuthUserStatus = 'present' | 'missing';

/**
 * Read-only counts and existence checks scoped to the fixture school. Never returns
 * document bodies, tokens, or PII beyond the identifiers already present in the manifest.
 */
export interface ResourceInspector {
  countByCollection(fixtureSchoolId: string): Promise<Readonly<Record<string, number>>>;
  /** Resource ids observed under the fixture school that are not part of the manifest's expected plan. */
  findOwnershipViolations(fixtureSchoolId: string, expectedResourceIds: readonly string[]): Promise<readonly string[]>;
}

export interface AuthInspector {
  checkExistence(authUsers: readonly string[]): Promise<Readonly<Record<string, AuthUserStatus>>>;
}

export interface InspectDependencies {
  readonly manifestStore: ManifestStore;
  readonly runLock: RunLock;
  readonly resourceInspector: ResourceInspector;
  readonly authInspector: AuthInspector;
  readonly clock: Clock;
}

export interface InspectResult {
  readonly testRunId: string;
  readonly state: FixtureRunState;
  readonly counts: Readonly<Record<string, number>>;
  readonly ownershipViolations: readonly string[];
  readonly authStatus: Readonly<Record<string, AuthUserStatus>>;
}

export const inspectFixtures = async (
  rawRequest: unknown,
  runtimeContext: RuntimeProjectContext,
  deps: InspectDependencies,
): Promise<InspectResult> => {
  assertStagingRuntime(runtimeContext);
  const request = parseInspectRequest(rawRequest);

  if (!deps.runLock.acquire(request.testRunId)) {
    throw new ConcurrencyLockError(`Fixture run ${request.testRunId} is locked by a concurrent operation.`);
  }

  try {
    const existing = await deps.manifestStore.get(request.testRunId);
    if (!existing) throw new ManifestNotFoundError(request.testRunId);
    assertManifestIntegrity(existing.manifest);

    const nextState = transition(existing.state, 'inspect');
    if (nextState !== existing.state) {
      await deps.manifestStore.update(request.testRunId, (record) => {
        assertManifestIntegrity(record.manifest);
        return {
          ...record,
          state: nextState,
          events: appendEvent(record.events, { testRunId: request.testRunId, type: 'INSPECTED', at: deps.clock.now().toISOString() }),
        };
      });
    }

    const [counts, ownershipViolations, authStatus] = await Promise.all([
      deps.resourceInspector.countByCollection(existing.manifest.fixtureSchoolId),
      deps.resourceInspector.findOwnershipViolations(existing.manifest.fixtureSchoolId, existing.manifest.expectedResourceIds),
      deps.authInspector.checkExistence(existing.manifest.authUsers),
    ]);

    return { testRunId: request.testRunId, state: nextState, counts, ownershipViolations, authStatus };
  } finally {
    deps.runLock.release(request.testRunId);
  }
};
