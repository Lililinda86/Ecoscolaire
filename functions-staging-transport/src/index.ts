/**
 * Staging-only Transport fixture broker — entry point.
 *
 * PHASE 1 SCOPE: this module intentionally does NOT import firebase-functions/
 * firebase-admin and is NOT wired into firebase.json. It is not deployed, not a
 * Cloud Function, and not reachable by any client. It only exposes pure request
 * handlers over injected ports so they can be exercised by unit/security tests
 * without ever touching live Firebase/GCP.
 *
 * A later phase will wire these handlers into a Gen2 HTTPS function
 * (`onRequest`, `us-central1`, invoker restricted to specific principals —
 * never `allUsers`) inside its own dedicated codebase, guarded at deploy time
 * by `assertStagingRuntime`. That wiring is out of scope here.
 */

export { parsePrepareRequest, parseInspectRequest, parseCleanupRequest, parseVerifyCleanupRequest, SchemaValidationError, SCHEMA_VERSION, TEST_RUN_ID_PATTERN } from './apiSchema';
export { assertStagingRuntime, assertNoItaloReference, RuntimeGuardError, STAGING_PROJECT_ID, PRODUCTION_PROJECT_ID, REAL_ITALO_SCHOOL_ID } from './runtimeGuards';
export * from './manifest';
export { transition, TransitionDeniedError } from './stateMachine';
export { prepareFixtures, PrepareConflictError, ConcurrencyLockError } from './prepare';
export { inspectFixtures, ManifestNotFoundError } from './inspect';
export { cleanupFixtures, ALLOWED_CLEANUP_COLLECTIONS, CleanupIdentityError } from './cleanup';
export { verifyCleanup, REQUIRED_RESIDUAL_CATEGORIES } from './verifyCleanup';

export type FixtureOperation = 'prepare' | 'inspect' | 'cleanup' | 'verifyCleanup';

/** Documents the approved (not-yet-deployed) HTTP surface for the next phase. */
export const FIXTURE_BROKER_ROUTES: Readonly<Record<FixtureOperation, string>> = Object.freeze({
  prepare: 'POST /v1/transport-fixtures:prepare',
  inspect: 'POST /v1/transport-fixtures:inspect',
  cleanup: 'POST /v1/transport-fixtures:cleanup',
  verifyCleanup: 'POST /v1/transport-fixtures:verifyCleanup',
});
