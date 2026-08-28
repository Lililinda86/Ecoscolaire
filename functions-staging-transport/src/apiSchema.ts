/**
 * Strict wire-contract schemas for the Staging-only Transport fixture broker.
 * Callers may only supply `schemaVersion` and `testRunId`. Every other identifier
 * (fixtureSchoolId, crossSchoolId, uid, collection, path, documentId, ...) is
 * always server-derived and must never be accepted from the request body.
 */

export const SCHEMA_VERSION = 1 as const;

// 8 to 20 digits, '-', then 1-3 digits with no leading zero (GitHub run_id-run_attempt shape).
export const TEST_RUN_ID_PATTERN = /^[0-9]{8,20}-[1-9][0-9]{0,2}$/;

export class SchemaValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SchemaValidationError';
    this.code = code;
  }
}

export interface FixtureOperationRequest {
  readonly schemaVersion: 1;
  readonly testRunId: string;
}

const FORBIDDEN_CALLER_FIELDS = ['schoolId', 'uid', 'collection', 'path', 'documentId', 'fixtureSchoolId', 'crossSchoolId'] as const;

const assertPlainObject = (raw: unknown): Record<string, unknown> => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SchemaValidationError('INVALID_BODY', 'Request body must be a JSON object.');
  }
  return raw as Record<string, unknown>;
};

const assertNoUnknownFields = (body: Record<string, unknown>, allowed: readonly string[]): void => {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(body)) {
    if (!allowedSet.has(key)) {
      throw new SchemaValidationError('UNKNOWN_FIELD', `Unknown field rejected: ${key}`);
    }
  }
  for (const forbidden of FORBIDDEN_CALLER_FIELDS) {
    if (forbidden in body) {
      throw new SchemaValidationError('CALLER_CONTROLLED_FIELD_REJECTED', `Caller may not supply: ${forbidden}`);
    }
  }
};

const assertSchemaVersion = (body: Record<string, unknown>): void => {
  if (body.schemaVersion !== SCHEMA_VERSION) {
    throw new SchemaValidationError('UNSUPPORTED_SCHEMA_VERSION', `Expected schemaVersion=${SCHEMA_VERSION}`);
  }
};

const assertTestRunId = (body: Record<string, unknown>): string => {
  if (typeof body.testRunId !== 'string' || !TEST_RUN_ID_PATTERN.test(body.testRunId)) {
    throw new SchemaValidationError('INVALID_TEST_RUN_ID', 'testRunId does not match the required pattern.');
  }
  return body.testRunId;
};

/** Every operation (prepare/inspect/cleanup/verifyCleanup) shares this exact envelope. */
const parseFixtureOperationRequest = (raw: unknown): FixtureOperationRequest => {
  const body = assertPlainObject(raw);
  assertNoUnknownFields(body, ['schemaVersion', 'testRunId']);
  assertSchemaVersion(body);
  const testRunId = assertTestRunId(body);
  return { schemaVersion: SCHEMA_VERSION, testRunId };
};

export const parsePrepareRequest = parseFixtureOperationRequest;
export const parseInspectRequest = parseFixtureOperationRequest;
export const parseCleanupRequest = parseFixtureOperationRequest;
export const parseVerifyCleanupRequest = parseFixtureOperationRequest;
