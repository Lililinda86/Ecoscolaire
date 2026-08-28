import { describe, expect, it } from 'vitest';
import {
  parsePrepareRequest,
  parseInspectRequest,
  parseCleanupRequest,
  parseVerifyCleanupRequest,
  SchemaValidationError,
  SCHEMA_VERSION,
} from '../src/apiSchema';

const VALID_TEST_RUN_ID = '33213214352-1';

describe('apiSchema', () => {
  for (const parse of [parsePrepareRequest, parseInspectRequest, parseCleanupRequest, parseVerifyCleanupRequest]) {
    it(`${parse.name}: accepts a valid envelope`, () => {
      const result = parse({ schemaVersion: SCHEMA_VERSION, testRunId: VALID_TEST_RUN_ID });
      expect(result).toEqual({ schemaVersion: 1, testRunId: VALID_TEST_RUN_ID });
    });

    it(`${parse.name}: rejects unknown fields`, () => {
      expect(() => parse({ schemaVersion: 1, testRunId: VALID_TEST_RUN_ID, extra: 'nope' }))
        .toThrowError(SchemaValidationError);
    });

    it(`${parse.name}: rejects caller-supplied schoolId`, () => {
      expect(() => parse({ schemaVersion: 1, testRunId: VALID_TEST_RUN_ID, schoolId: 'italo-gsb' }))
        .toThrowError(SchemaValidationError);
    });

    it(`${parse.name}: rejects caller-supplied uid/collection/path/documentId`, () => {
      for (const field of ['uid', 'collection', 'path', 'documentId', 'fixtureSchoolId', 'crossSchoolId']) {
        expect(() => parse({ schemaVersion: 1, testRunId: VALID_TEST_RUN_ID, [field]: 'x' }))
          .toThrowError(SchemaValidationError);
      }
    });

    it(`${parse.name}: rejects wrong schemaVersion`, () => {
      expect(() => parse({ schemaVersion: 2, testRunId: VALID_TEST_RUN_ID })).toThrowError(SchemaValidationError);
      expect(() => parse({ testRunId: VALID_TEST_RUN_ID })).toThrowError(SchemaValidationError);
    });

    it(`${parse.name}: rejects invalid testRunId shapes`, () => {
      for (const bad of ['123-1', '33213214352-0', '33213214352', 'abc-1', '33213214352-1234', '33213214352-01']) {
        expect(() => parse({ schemaVersion: 1, testRunId: bad })).toThrowError(SchemaValidationError);
      }
    });

    it(`${parse.name}: rejects non-object bodies`, () => {
      for (const bad of [null, undefined, 'string', 42, ['array']]) {
        expect(() => parse(bad)).toThrowError(SchemaValidationError);
      }
    });
  }
});
