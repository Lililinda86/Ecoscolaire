import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PRODUCTION_PROJECT,
  REAL_ITALO_SCHOOL,
  STAGING_PROJECT,
  validateReleaseSafety,
} from '../../scripts/test-transport-payments-release-safe.mjs';

const base = {
  expectedProject: STAGING_PROJECT,
  runtimeProjectId: STAGING_PROJECT,
  networkUrls: [],
  testRunId: '12345678-1',
  fixtureSchoolId: 'transport-release-staging-12345678-1',
  mode: 'staging',
};

const mustFail = (name, mutate) => test(`fail-closed: ${name}`, () => {
  const config = { ...base };
  mutate(config);
  assert.throws(() => validateReleaseSafety(config));
});

mustFail('expectedProject is mandatory', (config) => { delete config.expectedProject; });
mustFail('runtime projectId is authoritative and mandatory', (config) => { delete config.runtimeProjectId; });
mustFail('Production runtime cannot satisfy Staging', (config) => { config.runtimeProjectId = PRODUCTION_PROJECT; });
mustFail('Production network URL fails a Staging run', (config) => {
  config.networkUrls = ['https://firestore.googleapis.com/v1/projects/ecoscolaire-c5861/databases/(default)'];
});
mustFail('testRunId is mandatory', (config) => { delete config.testRunId; });
mustFail('fixture school is mandatory', (config) => { delete config.fixtureSchoolId; });
mustFail('fixture school must be isolated', (config) => { config.fixtureSchoolId = 'transport-release-staging'; });
mustFail('unknown expected project is rejected', (config) => { config.expectedProject = 'unknown-project'; });
mustFail('network evidence cannot replace runtime projectId', (config) => {
  delete config.runtimeProjectId;
  config.networkUrls = ['https://firestore.googleapis.com/v1/projects/ecoscolaire-staging/databases/(default)'];
});

test('fail-closed: the real ITALO school is forbidden', async () => {
  assert.throws(() => validateReleaseSafety({ ...base, fixtureSchoolId: REAL_ITALO_SCHOOL }));
  const runner = await readFile(new URL('../../scripts/test-transport-payments-release-safe.mjs', import.meta.url), 'utf8');
  assert.match(runner, /REAL_ITALO_SCHOOL\s*=\s*["']italo-gsb["']/);
});

test('isolated Staging configuration passes with no visible network project ID', () => {
  const result = validateReleaseSafety(base);
  assert.equal(result.runtimeProjectId, STAGING_PROJECT);
  assert.deepEqual(result.networkProjectIds, []);
});
