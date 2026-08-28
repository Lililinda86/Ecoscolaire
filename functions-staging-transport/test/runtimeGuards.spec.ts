import { describe, expect, it } from 'vitest';
import {
  assertNoItaloReference,
  assertStagingRuntime,
  PRODUCTION_PROJECT_ID,
  REAL_ITALO_SCHOOL_ID,
  RuntimeGuardError,
  STAGING_PROJECT_ID,
} from '../src/runtimeGuards';

describe('runtimeGuards', () => {
  it('accepts a fully consistent staging context', () => {
    expect(() => assertStagingRuntime({
      projectId: STAGING_PROJECT_ID,
      gcloudProject: STAGING_PROJECT_ID,
      googleCloudProject: STAGING_PROJECT_ID,
      functionsConfigProjectId: STAGING_PROJECT_ID,
    })).not.toThrow();
  });

  it('accepts staging context with only some identifiers present', () => {
    expect(() => assertStagingRuntime({ projectId: STAGING_PROJECT_ID })).not.toThrow();
  });

  it('rejects when no identifier is available (no fallback project)', () => {
    expect(() => assertStagingRuntime({})).toThrowError(RuntimeGuardError);
  });

  it('explicitly rejects the Production project', () => {
    expect(() => assertStagingRuntime({ projectId: PRODUCTION_PROJECT_ID })).toThrowError(RuntimeGuardError);
  });

  it('rejects any other/unknown project', () => {
    expect(() => assertStagingRuntime({ projectId: 'some-other-project' })).toThrowError(RuntimeGuardError);
  });

  it('rejects when runtime identifiers disagree with each other', () => {
    expect(() => assertStagingRuntime({ projectId: STAGING_PROJECT_ID, gcloudProject: PRODUCTION_PROJECT_ID }))
      .toThrowError(RuntimeGuardError);
  });

  it('rejects any reference to the real ITALO school anywhere in the runtime context', () => {
    expect(() => assertStagingRuntime({ projectId: STAGING_PROJECT_ID, functionsConfigProjectId: null } as never))
      .not.toThrow();
    expect(() => assertNoItaloReference({ note: `fixtureSchoolId=${REAL_ITALO_SCHOOL_ID}` })).toThrowError(RuntimeGuardError);
    expect(() => assertNoItaloReference(['nested', { deep: REAL_ITALO_SCHOOL_ID }])).toThrowError(RuntimeGuardError);
    expect(() => assertNoItaloReference('ITALO-GSB')).toThrowError(RuntimeGuardError);
  });

  it('allows payloads with no ITALO reference', () => {
    expect(() => assertNoItaloReference({ testRunId: '33213214352-1', nested: ['a', 'b'] })).not.toThrow();
  });
});
