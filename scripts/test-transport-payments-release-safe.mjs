import assert from 'node:assert/strict';

export const STAGING_PROJECT = 'ecoscolaire-staging';
export const PRODUCTION_PROJECT = 'ecoscolaire-c5861';
export const REAL_ITALO_SCHOOL = 'italo-gsb';

const FIREBASE_URL = /(?:firebaseio\.com|firebaseapp\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com)/i;

const projectInUrl = (rawUrl) => {
  let url = String(rawUrl || '');
  try {
    url = decodeURIComponent(url);
  } catch {
    return null;
  }
  if (!FIREBASE_URL.test(url)) return null;
  if (url.includes(PRODUCTION_PROJECT)) return PRODUCTION_PROJECT;
  if (url.includes(STAGING_PROJECT)) return STAGING_PROJECT;
  return null;
};

export const networkProjectIds = (networkUrls = []) => new Set(
  (Array.isArray(networkUrls) ? networkUrls : []).map(projectInUrl).filter(Boolean),
);

const requireText = (value, message) => {
  assert.equal(typeof value, 'string', message);
  assert.ok(value.trim(), message);
  return value.trim();
};

export const validateReleaseSafety = ({
  expectedProject,
  runtimeProjectId,
  networkUrls = [],
  testRunId,
  fixtureSchoolId,
  mode,
} = {}) => {
  const expected = requireText(expectedProject, 'expectedProject is mandatory.');
  assert.ok([STAGING_PROJECT, PRODUCTION_PROJECT].includes(expected), 'Unknown expectedProject.');
  const runtime = requireText(runtimeProjectId, 'Authoritative runtime Firebase projectId is missing.');
  assert.equal(runtime, expected, 'Authoritative runtime Firebase project mismatch.');
  const runId = requireText(testRunId, 'testRunId is mandatory.');
  const school = requireText(fixtureSchoolId, 'An isolated fixture school is mandatory.');
  assert.notEqual(school, REAL_ITALO_SCHOOL, 'The real ITALO school is forbidden.');
  assert.match(school, /^transport-release-(staging|production)-[A-Za-z0-9_-]+$/, 'Fixture school is not isolated.');
  if (mode) assert.equal(expected, mode === 'staging' ? STAGING_PROJECT : PRODUCTION_PROJECT, 'Mode and expectedProject mismatch.');

  const observed = networkProjectIds(networkUrls);
  if (expected === STAGING_PROJECT) {
    assert.ok(!observed.has(PRODUCTION_PROJECT), 'A Production Firebase project was observed on the network.');
  }
  return { expectedProject: expected, runtimeProjectId: runtime, testRunId: runId, fixtureSchoolId: school,
    networkProjectIds: [...observed] };
};

export const configFromEnvironment = (env = process.env) => validateReleaseSafety({
  expectedProject: env.TRANSPORT_EXPECTED_PROJECT,
  runtimeProjectId: env.TRANSPORT_RUNTIME_PROJECT_ID,
  networkUrls: env.TRANSPORT_NETWORK_URLS ? JSON.parse(env.TRANSPORT_NETWORK_URLS) : [],
  testRunId: env.TRANSPORT_TEST_RUN_ID,
  fixtureSchoolId: env.TRANSPORT_FIXTURE_SCHOOL_ID,
  mode: env.TRANSPORT_RELEASE_MODE,
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = configFromEnvironment();
  console.log(`RELEASE SAFE: PASS runtime=${result.runtimeProjectId} testRunId=${result.testRunId} network=${result.networkProjectIds.join(',') || 'none'}`);
}