import assert from 'node:assert/strict';

const PROJECTS = { staging: 'ecoscolaire-staging', production: 'ecoscolaire-c5861' };
const REAL_ITALO_SCHOOL = 'italo-gsb';
const WEB_ENV = [
  'TRANSPORT_FIREBASE_API_KEY', 'TRANSPORT_FIREBASE_AUTH_DOMAIN',
  'TRANSPORT_FIREBASE_STORAGE_BUCKET', 'TRANSPORT_FIREBASE_MESSAGING_SENDER_ID',
  'TRANSPORT_FIREBASE_APP_ID',
];

const safeToken = (value) => String(value || '').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 96);

export const expectedTransportReleaseRef = (mode) => ({ staging: 'refs/heads/staging', production: 'refs/heads/main' })[mode] || null;

export const validateTransportReleaseRef = (mode, actualRef) => {
  const expectedRef = expectedTransportReleaseRef(mode);
  assert.ok(expectedRef, 'TRANSPORT_RELEASE_MODE must be staging or production.');
  assert.equal(actualRef, expectedRef, 'Git ref does not match release mode.');
  return expectedRef;
};

export const validateTransportRunnerConfig = (env = process.env) => {
  const mode = String(env.TRANSPORT_RELEASE_MODE || '').trim();
  assert.ok(Object.hasOwn(PROJECTS, mode), 'TRANSPORT_RELEASE_MODE must be staging or production.');
  const expectedProject = PROJECTS[mode];
  assert.equal(env.TRANSPORT_FIREBASE_PROJECT_ID, expectedProject, 'Configured project does not match release mode.');
  assert.equal(env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT, expectedProject, 'ADC project is ambiguous or mismatched.');
  assert.equal(env.TRANSPORT_TEST_FIXTURE, 'true', 'testFixture capability was not explicitly enabled.');
  assert.equal(env.TRANSPORT_REQUIRED_FUNCTIONS_VERIFIED, 'true', 'Required Functions were not preflighted.');
  assert.equal(env.TRANSPORT_CLEANUP_CAPABILITY_VERIFIED, 'true', 'Cleanup capability was not preflighted.');
  const testRunId = safeToken(env.TRANSPORT_TEST_RUN_ID);
  assert.ok(testRunId && testRunId === env.TRANSPORT_TEST_RUN_ID && testRunId.length >= 8, 'Missing or unsafe testRunId.');
  assert.notEqual(env.TRANSPORT_FIXTURE_SCHOOL_ID, REAL_ITALO_SCHOOL, 'Real ITALO school is forbidden.');
  const expectedSchool = `transport-release-${mode}-${testRunId}`.slice(0, 120);
  assert.equal(env.TRANSPORT_FIXTURE_SCHOOL_ID, expectedSchool, 'Fixture school ID is not exact for this run.');
  for (const name of ['TRANSPORT_APP_URL', ...WEB_ENV]) assert.ok(env[name]?.trim(), `Missing ${name}.`);
  const url = new URL(env.TRANSPORT_APP_URL);
  assert.equal(url.protocol, 'https:', 'Application URL must be HTTPS.');
  if (mode === 'production') assert.equal(url.hostname, 'ecoscolaire.vercel.app', 'Production URL mismatch.');
  if (mode === 'staging') {
    assert.match(url.hostname, /^ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/,
      'Staging requires an immutable Vercel Preview URL.');
    assert.ok(env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim(), 'Missing Preview bypass secret.');
  }
  return { mode, expectedProject, testRunId, fixtureSchoolId: expectedSchool, appUrl: url.origin };
};
