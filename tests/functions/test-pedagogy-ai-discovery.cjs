const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

// Reproduce Firebase CLI's sanitized child environment: no dotenv, key or ADC.
for (const project of ['ecoscolaire-staging', 'demo-ecoscolaire', 'ecoscolaire-production']) {
  const result = spawnSync(process.execPath, ['-e', `
    const gateway = require('./functions/lib/pedagogy/aiPrivateGateway').pedagogySyntheticAiGateway;
    process.stdout.write(JSON.stringify(gateway.__endpoint.secretEnvironmentVariables));
  `], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 15000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GCLOUD_PROJECT: project, FUNCTIONS_CONTROL_API: 'true' },
  });
  assert.equal(result.status, 0, JSON.stringify({ error: result.error?.code, signal: result.signal, stdout: result.stdout, stderr: result.stderr }));
  assert.deepEqual(JSON.parse(result.stdout), project === 'ecoscolaire-staging' ? [{ key: 'PEDAGOGY_OPENAI_API_KEY' }] : []);
}
console.log('PASS: isolated SDK discovery binds exactly one secret in Staging only; zero provider calls');
